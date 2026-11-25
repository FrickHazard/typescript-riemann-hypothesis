#!/usr/bin/env node
// Generate the TypeScript projects for an entire proof in one export-server session,
// without checking them (no tsc). For measuring size and preparing later builds.
//
//   node --max-old-space-size=16384 tools/genall.mjs ORDER.tsv OUTDIR [--size N] [--thm-as-axiom] [--limit DECLS]
//
// ORDER: tools/closure.mjs --all output (a valid checking order). Declarations are fed to
// tools/ExportServer.lean in groups of N; each group becomes project OUTDIR/pK, laid out
// like tools/batch.mjs projects (same environment scheme), but DAG nodes keep the
// server's global numbering (one session numbers every name/level/expression once), so
// no per-node hash table is held in memory: node id -> project is a growable Int32Array.
//
// See FUTURE WORK in tools/lean2ts.mjs: proofs should eventually be compressed globally,
// across module and project boundaries, for smaller .ts and faster tsc verification;
// project layout here would then follow the compressed DAG rather than export order.

import { readFileSync, writeFileSync, mkdirSync, rmSync, createWriteStream } from "node:fs";
import { join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { feed } from "./lean2ts.mjs";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const LEAN_PROJECT = process.env.LEAN_PROJECT ?? resolve(REPO, "../riemann-hypothesis");
const SERVER = resolve(REPO, "../lean4export/.lake/build/bin/exportserver");
const MODULE = process.env.LEAN_MODULE ?? "Main";

const args = process.argv.slice(2);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const valued = new Set(["--size", "--limit"]);
const [orderPath, outArg] = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const SIZE = Number(opt("--size", 300));
const LIMIT = Number(opt("--limit", Infinity));
const thmAsAxiom = args.includes("--thm-as-axiom");
const OUT = resolve(outArg);

const order = readFileSync(orderPath, "utf8").split("\n").filter(Boolean).map((l) => l.split("\t")[2]).slice(0, LIMIT);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Node -> project, by kind: E (expressions) and U (levels) have separate numberings.
const owner = { E: new Int32Array(1 << 20).fill(-1), U: new Int32Array(1 << 12).fill(-1) };
const setOwner = (k, n, p) => {
  let a = owner[k];
  if (n >= a.length) { let len = a.length; while (n >= len) len *= 2; const b = new Int32Array(len).fill(-1); b.set(a); owner[k] = a = b; }
  a[n] = p;
};
const getOwner = (k, n) => (n < owner[k].length ? owner[k][n] : -1);

/** Node references (E123, U45) outside string literals: declaration names may contain such text. */
const REF = /"(?:[^"\\]|\\.)*"|\b([EU]\d+)\b/g;
const refsOf = (s) => { const out = []; for (const m of s.matchAll(REF)) if (m[1]) out.push(m[1]); return out; };

const lakeEnv = { ...process.env, PATH: `${process.env.HOME}/.elan/bin:${process.env.PATH}` };
const child = spawn("lake", ["env", SERVER, MODULE], { cwd: LEAN_PROJECT, env: lakeEnv, stdio: ["pipe", "pipe", "inherit"] });
const it = createInterface({ input: child.stdout, crlfDelay: Infinity })[Symbol.asyncIterator]();
const readUntil = async (marker) => {
  const out = [];
  for (;;) {
    const { value, done } = await it.next();
    if (done) throw new Error("export server exited");
    if (value.startsWith(marker)) return out.join("\n");
    out.push(value);
  }
};

const kernel = resolve(REPO, "src");
const KERNEL = "LZero, LSucc, LMax, LIMax, LParam, B, Sort, Const, App, Lam, Pi, Let, Proj, NatLit, StrLit, " +
  "Axiom, Defn, Thm, Opaque, QuotDecl, Induct, Ctor, Rec, RecRule, CheckDeclAt, Verified, AsAxiom, Idx, Flat";
const stats = createWriteStream(join(OUT, "stats.tsv"));
const t0 = Date.now();
feed(await readUntil('{"ready"'));
console.error(`export server ready in ${Date.now() - t0}ms; ${order.length} declarations, groups of ${SIZE}`);

let declCount = 0, totalNodes = 0, totalBytes = 0, tExport = 0, tWrite = 0;
for (let K = 0, at = 0; at < order.length; K++, at += SIZE) {
  const t1 = Date.now();
  child.stdin.write(order.slice(at, at + SIZE).join(" ") + "\n");
  const { items } = feed(await readUntil('{"batchEnd"'), `group ${K}`);
  const t2 = Date.now();
  tExport += t2 - t1;

  const aliases = items.filter((x) => x.alias), decls = items.filter((x) => x.decl);
  for (const a of aliases) setOwner(a.alias[0], Number(a.alias.slice(1)), K);
  const imports = new Map();
  for (const s of [...aliases.map((a) => a.rhs), ...decls.map((d) => d.decl)])
    for (const r of refsOf(s)) {
      const p = getOwner(r[0], Number(r.slice(1)));
      if (p < 0) throw new Error(`group ${K}: node ${r} has no owner`);
      if (p !== K) (imports.get(p) ?? imports.set(p, new Set()).get(p)).add(r);
    }
  if (K > 0 && !imports.has(K - 1)) imports.set(K - 1, new Set());

  const dir = join(OUT, `p${K}`);
  mkdirSync(dir);
  const lines = [`// Generated by tools/genall.mjs: group ${K}. Do not edit.`,
    `import type { ${KERNEL} } from "${relative(dir, kernel)}/index";`];
  for (const [p, rs] of [...imports].sort((x, y) => x[0] - y[0])) {
    const ns = [...rs].sort();
    if (p === K - 1) ns.push("Env as Prev");
    lines.push(`import type { ${ns.join(", ")} } from "../p${p}/index";`);
  }
  lines.push("");
  for (const a of aliases) lines.push(`export type ${a.alias} = ${a.rhs};`); // no spread: groups can have 10^5+ nodes
  lines.push("");
  const own = [];
  decls.forEach((d, i) => {
    lines.push(`export type D${i} = ${d.decl};`);
    own.push(`  ${d.name}: Idx<${thmAsAxiom ? `AsAxiom<D${i}>` : `D${i}`}, ${declCount + i}>;`);
  });
  lines.push("", "type Own = {");
  for (const o of own) lines.push(o);
  lines.push("};", `type BatchEnv = ${K > 0 ? "Flat<Prev> & Own" : "Own"};`, "");
  decls.forEach((d, i) => lines.push(`export type Check_D${i} = Verified<CheckDeclAt<BatchEnv, D${i}, ${declCount + i}>>; // ${d.name}`));
  lines.push("", `export type Env = ${K > 0 ? "Prev & Own" : "Own"};`, "");
  const text = lines.join("\n");
  writeFileSync(join(dir, "index.ts"), text);
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify({
    compilerOptions: { composite: true, declaration: true, emitDeclarationOnly: true, outDir: "out", rootDir: ".",
      strict: true, target: "esnext", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, types: [] },
    files: ["index.ts"],
    references: [{ path: relative(dir, kernel) }, ...[...imports.keys()].sort((x, y) => x - y).map((p) => ({ path: `../p${p}` }))],
  }));
  tWrite += Date.now() - t2;
  declCount += decls.length; totalNodes += aliases.length; totalBytes += text.length;
  stats.write(`p${K}\t${decls.length}\t${aliases.length}\t${text.length}\t${imports.size}\n`);
  if (K % 100 === 0) console.error(`p${K}: ${declCount} decls, ${totalNodes} nodes, ${(totalBytes / 1e9).toFixed(2)} GB TS, ` +
    `export ${(tExport / 1000).toFixed(0)}s, write ${(tWrite / 1000).toFixed(0)}s, elapsed ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
child.stdin.end("\n");
console.error(`done: ${declCount} declarations, ${totalNodes} DAG nodes, ${(totalBytes / 1e9).toFixed(2)} GB of TypeScript, ` +
  `export ${(tExport / 1000).toFixed(0)}s, write ${(tWrite / 1000).toFixed(0)}s, total ${((Date.now() - t0) / 1000).toFixed(0)}s`);
stats.end();
