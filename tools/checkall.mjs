#!/usr/bin/env node
// Check every module of proof/ with tsc (via tools/modcheck.mjs), in parallel, resumably.
//
//   node tools/checkall.mjs PROOF_DIR [--jobs N] [--timeout SECONDS] [--heap MB]
//
// Modules run cheapest first (by the size of the interfaces their check must load). Each
// result is appended to PROOF_DIR/results.tsv:  module, status, seconds, declarations,
// first error. A module already recorded as OK is skipped, so rerunning continues; failed,
// timed-out or crashed modules are retried.

import { readFileSync, appendFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const PROOF = resolve(args[0]);
const JOBS = Number(opt("--jobs", 5)), TIMEOUT = Number(opt("--timeout", 7200)), HEAP = opt("--heap", "8000");
const REPO = resolve(new URL("..", import.meta.url).pathname);
const m = JSON.parse(readFileSync(join(PROOF, "manifest.json"), "utf8")).modules;
const results = join(PROOF, "results.tsv");
const ok = new Set();
if (existsSync(results)) for (const l of readFileSync(results, "utf8").split("\n")) { const [mod, st] = l.split("\t"); if (st === "OK") ok.add(mod); }

// Cost: bytes of the interfaces in the transitive closure plus the module itself.
const memo = new Map();
const clo = (x) => { if (memo.has(x)) return memo.get(x); const s = new Set(); for (const u of m[x].uses) { s.add(u); for (const v of clo(u)) s.add(v); } memo.set(x, s); return s; };
const cost = (x) => { let b = m[x].bytes; for (const u of clo(x)) b += m[u].apiBytes ?? m[u].bytes; return b; };
const todo = Object.keys(m).filter((x) => !ok.has(x)).map((x) => [cost(x), x]).sort((a, b) => a[0] - b[0]).map((r) => r[1]);
console.error(`${Object.keys(m).length} modules, ${ok.size} already OK, ${todo.length} to check, ${JOBS} at a time`);

let next = 0, done = 0, okNow = 0, bad = 0;
const t0 = Date.now();
function run() {
  if (next >= todo.length) return Promise.resolve();
  const mod = todo[next++];
  return new Promise((res) => {
    const t = Date.now();
    const p = spawn("node", [join(REPO, "tools/modcheck.mjs"), PROOF, mod], { env: { ...process.env, TSC_HEAP_MB: HEAP } });
    let out = "";
    p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => p.kill("SIGKILL"), TIMEOUT * 1000);
    p.on("close", (code, sig) => {
      clearTimeout(timer);
      const secs = ((Date.now() - t) / 1000).toFixed(1);
      const status = sig ? "TIMEOUT" : out.includes("OK, all verified") ? "OK" : out.includes("FAILED") ? "FAILED" : "CRASH";
      const err = status === "OK" ? "" : (out.split("\n").find((l) => l.startsWith("    ")) ?? out.split("\n").filter(Boolean).pop() ?? "").trim().slice(0, 300);
      appendFileSync(results, `${mod}\t${status}\t${secs}\t${m[mod].decls.length}\t${err}\n`);
      done++; if (status === "OK") okNow++; else bad++;
      if (done % 50 === 0 || status !== "OK")
        console.error(`[${((Date.now() - t0) / 60000).toFixed(1)} min] ${done}/${todo.length} checked (${okNow} OK, ${bad} not): ${mod} ${status} ${secs}s ${err.slice(0, 120)}`);
      res(run());
    });
  });
}
await Promise.all(Array.from({ length: JOBS }, run));
console.error(`done: ${okNow} OK, ${bad} not OK of ${todo.length} in ${((Date.now() - t0) / 60000).toFixed(1)} min`);
