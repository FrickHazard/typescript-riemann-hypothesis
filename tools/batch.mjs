#!/usr/bin/env node
// Incremental, smallest-first checking of a large Lean proof as a growing set of
// TypeScript projects. Each run adds ONE batch project and builds it with `tsc -b`.
//
//   node tools/batch.mjs init  STATE ORDER.tsv     # ORDER from tools/closure.mjs
//   node tools/batch.mjs next  STATE [--size N] [--thm-as-axiom]
//   tools/tsc.sh -b STATE/projects/bK              # or let `next` run it (default)
//
// Design:
//  - Declarations are taken in ascending closure size, so every batch's dependencies
//    are in earlier batches (a closure contains its dependencies' closures).
//  - Each batch is exported on its own (lean4export closure of the batch), so no
//    export is ever large.
//  - DAG nodes are content-addressed: a node's alias is a hash of its content with
//    children replaced by their hashes. Node numbering in an export is local to that
//    export, but hashes are global, so a batch imports nodes it shares with earlier
//    batches instead of re-declaring them.
//  - STATE/registry.json maps every node hash and declaration name to the batch that
//    defines it. Batch K checks its declarations against Env of batch K-1 plus its own
//    earlier ones, and exports Env (theorems as axioms with --thm-as-axiom).

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { execFileSync, spawnSync, spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { convert, feed } from "./lean2ts.mjs";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const LEAN_PROJECT = process.env.LEAN_PROJECT ?? resolve(REPO, "../riemann-hypothesis");
const EXPORTER = resolve(REPO, "../lean4export/.lake/build/bin/lean4export");
const SERVER = resolve(REPO, "../lean4export/.lake/build/bin/exportserver");
const MODULE = process.env.LEAN_MODULE ?? "Main";

const [cmd, stateArg, ...rest] = process.argv.slice(2);
if (!cmd || !stateArg) { console.error("usage: batch.mjs init STATE ORDER.tsv | next STATE [--size N] [--thm-as-axiom] [--no-build] | run STATE [--size N] [--count M] [--thm-as-axiom]"); process.exit(2); }
const STATE = resolve(stateArg);
const regPath = join(STATE, "registry.json");
const load = () => JSON.parse(readFileSync(regPath, "utf8"));
const save = (r) => writeFileSync(regPath, JSON.stringify(r));

if (cmd === "init") {
  const order = readFileSync(rest[0], "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[2]);
  mkdirSync(join(STATE, "projects"), { recursive: true });
  save({ order, next: 0, batches: 0, nodes: {}, decls: {} });
  console.error(`${STATE}: ${order.length} declarations queued`);
  process.exit(0);
}
if (cmd !== "next" && cmd !== "run") throw new Error(`unknown command ${cmd}`);

const opt = (f, d) => { const i = rest.indexOf(f); return i >= 0 ? rest[i + 1] : d; };
const SIZE = Number(opt("--size", 200));
const thmAsAxiom = rest.includes("--thm-as-axiom");
const build = !rest.includes("--no-build");
const lakeEnv = { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` };
let local = new Map(); // export node (E12, U3) -> content hash; persists across server batches
const nextNames = (reg) => reg.order.slice(reg.next, reg.next + SIZE).filter((n) => !(n in reg.decls));

if (cmd === "next") {
  const reg = load();
  const want = nextNames(reg);
  if (!want.length) { console.error("nothing left to do"); process.exit(0); }
  // 1. Export just this batch's closure.
  const t0 = Date.now();
  const ndjson = execFileSync("lake", ["env", EXPORTER, MODULE, "--", ...want],
    { cwd: LEAN_PROJECT, maxBuffer: 1 << 30, encoding: "utf8", env: lakeEnv });
  const { items } = convert(ndjson, `batch ${reg.batches}`);
  if (emitBatch(reg, items, Date.now() - t0) === "FAILED") process.exit(1);
} else {
  // Persistent export server: the environment is loaded once for all batches.
  const COUNT = Number(opt("--count", 1));
  const child = spawn("lake", ["env", SERVER, MODULE], { cwd: LEAN_PROJECT, env: lakeEnv, stdio: ["pipe", "pipe", "inherit"] });
  const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const it = rl[Symbol.asyncIterator]();
  const readUntil = async (marker) => {
    const out = [];
    for (;;) {
      const { value, done } = await it.next();
      if (done) throw new Error("export server exited");
      if (value.startsWith(marker)) return out.join("\n");
      out.push(value);
    }
  };
  const t0 = Date.now();
  const preamble = await readUntil('{"ready"');
  feed(preamble);
  console.error(`export server ready in ${Date.now() - t0}ms`);
  for (let b = 0; b < COUNT; b++) {
    const reg = load();
    const want = nextNames(reg);
    if (!want.length) { console.error("nothing left to do"); break; }
    const t1 = Date.now();
    child.stdin.write(want.join(" ") + "\n");
    const text = await readUntil('{"batchEnd"');
    const { items } = feed(text, `batch ${reg.batches}`);
    if (emitBatch(reg, items, Date.now() - t1) === "FAILED") { child.stdin.end("\n"); process.exit(1); }
  }
  child.stdin.end("\n");
}
// 2. Convert, renaming export-local nodes (E12, U3) to content hashes.
function emitBatch(reg, items, tExport) {
const K = reg.batches;
const sub = (s) => s.replace(/\b[EU]\d+\b/g, (r) => { const h = local.get(r); if (!h) throw new Error(`unresolved ${r}`); return h; });
const own = [], ownSet = new Set(), decls = [];
for (const it of items) {
  if (it.alias) {
    const rhs = sub(it.rhs);
    const h = "H" + createHash("sha1").update(rhs).digest("hex").slice(0, 16);
    local.set(it.alias, h);
    if (!(h in reg.nodes) && !ownSet.has(h)) { own.push([h, rhs]); ownSet.add(h); }
  } else {
    const name = JSON.parse(it.name);
    if (!(name in reg.decls)) decls.push([name, sub(it.decl)]);
  }
}

// 3. Emit project bK.
const dir = join(STATE, "projects", `b${K}`);
mkdirSync(dir, { recursive: true });
const imports = new Map();
for (const s of [...own.map((o) => o[1]), ...decls.map((d) => d[1])])
  for (const h of s.match(/\bH[0-9a-f]{16}\b/g) ?? [])
    if (!ownSet.has(h)) { const b = reg.nodes[h]; (imports.get(b) ?? imports.set(b, new Set()).get(b)).add(h); }
if (K > 0 && !imports.has(K - 1)) imports.set(K - 1, new Set());
const kernel = resolve(REPO, "src");
const lines = [`// Generated by tools/batch.mjs: batch ${K}. Do not edit.`,
  `import type { LZero, LSucc, LMax, LIMax, LParam, B, Sort, Const, App, Lam, Pi, Let, Proj, NatLit, StrLit, ` +
  `Axiom, Defn, Thm, Opaque, QuotDecl, Induct, Ctor, Rec, RecRule, CheckDecl, Verified, AsAxiom } from "${relative(dir, kernel)}/index";`];
for (const [b, hs] of [...imports].sort((x, y) => x[0] - y[0])) {
  const names = [...hs].sort();
  if (b === K - 1) names.push("Env as Prev");
  lines.push(`import type { ${names.join(", ")} } from "../b${b}/index";`);
}
lines.push("", ...own.map(([h, rhs]) => `export type ${h} = ${rhs};`), "");
const env = [K > 0 ? "Prev" : "{}"];
decls.forEach(([name, ts], i) => {
  lines.push(`export type D${i} = ${ts};`);
  lines.push(`export type Check_D${i} = Verified<CheckDecl<${env.join(" & ")}, D${i}>>; // ${name}`);
  env.push(`{ ${JSON.stringify(name)}: ${thmAsAxiom ? `AsAxiom<D${i}>` : `D${i}`} }`);
});
lines.push("", `export type Env = ${env.join(" & ")};`, "");
writeFileSync(join(dir, "index.ts"), lines.join("\n"));
writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
  compilerOptions: { composite: true, declaration: true, emitDeclarationOnly: true, outDir: "out", rootDir: ".",
    strict: true, target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, types: [] },
  files: ["index.ts"],
  references: [{ path: relative(dir, kernel) }, ...[...imports.keys()].sort((x, y) => x - y).map((b) => ({ path: `../b${b}` }))],
}, null, 2));

// 4. Register and build.
for (const [h] of own) reg.nodes[h] = K;
for (const [name] of decls) reg.decls[name] = K;
reg.next += SIZE; reg.batches += 1;
save(reg);
let tBuild = null, status = "not built", err = "";
if (build) {
  const t1 = Date.now();
  const r = spawnSync(join(REPO, "tools/tsc.sh"), ["-b", dir], { encoding: "utf8", env: { ...process.env, TSC_HEAP_MB: process.env.TSC_HEAP_MB ?? "16384" } });
  tBuild = Date.now() - t1;
  status = r.status === 0 ? "ok" : "FAILED";
  err = (r.stdout + r.stderr).split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 400);
}
const line = `b${K}\t${decls.length} decls\t${own.length} new nodes\texport ${tExport}ms\tbuild ${tBuild}ms\t${status}\t${err}`;
appendFileSync(join(STATE, "log.tsv"), line + "\n");
console.log(line);
return status;
}
