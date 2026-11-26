#!/usr/bin/env node
// Per-module TypeScript generation from tools/ModExport.lean output, deterministic and
// resumable, with a manifest.
//
//   node tools/modts.mjs NDJSON_DIR OUT_DIR [--jobs N]
//
// For each NDJSON_DIR/<Module>.ndjson writes OUT_DIR/ts/<Module path>.ts, e.g.
// Mathlib/Algebra/Group/Basic.ts, and records it in OUT_DIR/manifest.json:
//   modules[<Module>] = { ndjson: sha1, ts: path, decls: [names], uses: [modules], nodes, bytes }
// so every Lean module (one .olean) maps to its TypeScript file(s).
//
//  - Deterministic: DAG nodes are named by a hash of their content (H...), declarations by
//    a hash of their name (D...); the same NDJSON always yields byte-identical TypeScript.
//  - Resumable: a module whose NDJSON hash matches the manifest and whose .ts exists is
//    skipped; the manifest is rewritten atomically after the run.
//  - Imports: a module imports `Decls` (name -> declaration alias) only from modules whose
//    constants it references; the name -> module map comes from all NDJSON files (pass 1).
//
// The checking environment built from these imports is the next step (see README).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, renameSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { convert, inlineItems } from "./lean2ts.mjs";

const sha1 = (s) => createHash("sha1").update(s).digest("hex");
const declAlias = (name) => "D" + sha1(name).slice(0, 16);
const modPath = (mod) => mod.split(".").join("/") + ".ts";
// Node references outside string literals (declaration names may contain text like U0).
const REF = /"(?:[^"\\]|\\.)*"|\b([EU]\d+)\b/g;
const CONST = /Const<("(?:[^"\\]|\\.)*")/g;

/** Names declared in an NDJSON export, read from its declaration lines only. */
function declNames(text) {
  const names = new Map([[0, ""]]), out = [];
  for (const line of text.split("\n")) {
    // Expression and level lines are most of the file and never declare names: skip them
    // without parsing (lean4export writes object keys in sorted order).
    if (!line || (!line.startsWith('{"in"') && (line.includes('"ie":') || line.includes('"il":')))) continue;
    const o = JSON.parse(line);
    if (o.in !== undefined) {
      const v = o.str ?? o.num, p = names.get(v.pre);
      names.set(o.in, (p ? p + "." : "") + (o.str ? v.str : String(v.i)));
    } else if (o.inductive) {
      for (const x of [...o.inductive.types, ...o.inductive.ctors, ...o.inductive.recs]) out.push(names.get(x.name));
    } else for (const k of ["def", "thm", "axiom", "opaque", "quot"]) if (o[k]) out.push(names.get(o[k].name));
  }
  return out;
}

// Compact, deterministic encoding (format v2). Same terms and same kernel types as the
// plain converter output, written to be small:
//  - single-use and tiny nodes are inlined (depth-capped), only shared nodes get aliases;
//  - aliases are file-local short names ($0, $1, ...): nodes never cross modules, only the
//    exported `Decls` table does;
//  - kernel constructors use short re-exported names (src/short.ts: App as A, ...);
//  - `Const<"x", []>` drops the empty level list (it is the default);
//  - string literals used more than once (constant names) go into a per-file table.
const SHORT = { App: "A", Lam: "L", Pi: "P", Sort: "S", Const: "C", Let: "T", Proj: "J", NatLit: "N", StrLit: "R",
  LZero: "Z", LSucc: "U", LMax: "M", LIMax: "I", LParam: "Q",
  Axiom: "Ax", Defn: "Df", Thm: "Th", Opaque: "Op", QuotDecl: "Qu", Induct: "In", Ctor: "Ct", Rec: "Rc", RecRule: "RR" };
const SHORT_RE = new RegExp(`"(?:[^"\\\\]|\\\\.)*"|\\b(${Object.keys(SHORT).join("|")})\\b`, "g");
const STR_RE = /"(?:[^"\\]|\\.)*"/g;
const b36 = (n) => n.toString(36);


/** Split the top-level arguments of `Head<a, b, ...>` (strings and nested brackets respected). */
function topArgs(t) {
  const open = t.indexOf("<"), out = [];
  let depth = 0, start = open + 1, inStr = false;
  for (let i = open + 1; i < t.length - 1; i++) {
    const ch = t[i];
    if (inStr) { if (ch === "\\") i++; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "<" || ch === "[" || ch === "{" || ch === "(") depth++;
    else if (ch === ">" || ch === "]" || ch === "}" || ch === ")") depth--;
    else if (ch === "," && depth === 0) { out.push(t.slice(start, i).trim()); start = i + 1; }
  }
  out.push(t.slice(start, t.length - 1).trim());
  return out;
}

function emitModule(mod, text, owner, outDir) {
  const { items } = convert(text, mod);
  // Cross-module references, from the unshortened terms.
  const own = new Set(items.filter((x) => x.decl).map((x) => JSON.parse(x.name))), uses = new Set();
  for (const it of items) for (const m of (it.alias ? it.rhs : it.decl).matchAll(CONST)) {
    const name = JSON.parse(m[1]);
    if (!own.has(name)) { const o = owner.get(name); if (o && o !== mod) uses.add(o); }
  }
  const inl = inlineItems(items);
  // Local names for the remaining aliases and for declarations, in emit order.
  const local = new Map(); let k = 0;
  for (const it of inl) if (it.alias) local.set(it.alias, "$" + b36(k++));
  const ren = (s) => s.replace(REF, (m, r) => (r ? local.get(r) ?? (() => { throw new Error(`${mod}: unresolved ${r}`); })() : m));
  const short = (s) => s.replace(SHORT_RE, (m, w) => (w ? SHORT[w] : m)).replace(/\bC<("(?:[^"\\]|\\.)*"), \[\]>/g, "C<$1>");
  const body = [], decls = [];
  for (const it of inl) {
    if (it.alias) body.push([local.get(it.alias), short(ren(it.rhs))]);
    else { const id = "$" + b36(k++); decls.push([JSON.parse(it.name), id]); body.push([id, short(ren(it.decl))]); }
  }
  // String table for literals used more than once.
  const sc = new Map();
  for (const [, t] of body) for (const m of t.matchAll(STR_RE)) if (m[0].length >= 8) sc.set(m[0], (sc.get(m[0]) ?? 0) + 1);
  const strs = new Map(); let j = 0;
  for (const [lit, c] of [...sc].sort((a, b) => (a[0] < b[0] ? -1 : 1))) if (c > 1) strs.set(lit, "_" + b36(j++));
  const tab = (t) => t.replace(STR_RE, (m) => strs.get(m) ?? m);

  const file = join(outDir, "ts", modPath(mod));
  let kernel = relative(dirname(file), resolve(fileURLToPath(new URL("../src/short", import.meta.url))));
  if (!kernel.startsWith(".")) kernel = "./" + kernel;
  const lines = [`// Generated by tools/modts.mjs (format v2) from Lean module ${mod}. Do not edit.`,
    `import type { A, L, P, S, C, T, J, N, R, B, Z, U, M, I, Q, Ax, Df, Th, Op, Qu, In, Ct, Rc, RR } from "${kernel}";`];
  const usesSorted = [...uses].sort();
  for (const u of usesSorted) {
    // Relative to the target .ts file, then drop the extension: a module can share its name
    // with a directory (Mathlib/Order/Lattice.ts next to Mathlib/Order/Lattice/).
    let rel = relative(dirname(file), join(outDir, "ts", modPath(u))).replace(/\.ts$/, "");
    if (!rel.startsWith(".")) rel = "./" + rel;
    lines.push(`import type { Decls as M${sha1(u).slice(0, 12)} } from "${rel}.api";`);
  }
  const header = lines.slice();
  for (const [lit, id] of strs) lines.push(`type ${id} = ${lit};`);
  for (const [id, t] of body) lines.push(`type ${id} = ${tab(t)};`);
  lines.push("export type Decls = {");
  for (const [name, id] of decls) lines.push(`${JSON.stringify(name)}: ${id};`);
  lines.push("};", "");
  const out = lines.join("\n");
  // Interface file for importers: theorems as axioms with the same statement (their proofs
  // are checked in this module's own check), keeping only the nodes the interface reaches.
  const texts = new Map(body), thm = new Set();
  const apiText = new Map();
  for (const [name, id] of decls) {
    const t = texts.get(id);
    if (t.startsWith("Th<")) { const [n, ps, ty] = topArgs(t); apiText.set(id, `Ax<${n}, ${ps}, ${ty}>`); thm.add(id); }
  }
  const IDREF = /"(?:[^"\\]|\\.)*"|(\$[0-9a-z]+)/g;
  const keep = new Set(), stack = decls.map((d) => d[1]);
  while (stack.length) {
    const id = stack.pop();
    if (keep.has(id)) continue;
    keep.add(id);
    for (const m of (apiText.get(id) ?? texts.get(id)).matchAll(IDREF)) if (m[1] && texts.has(m[1])) stack.push(m[1]);
  }
  const api = header.slice();
  api[0] = api[0].replace("Do not edit.", "Interface (theorem statements only). Do not edit.");
  const apiBody = body.filter(([id]) => keep.has(id)).map(([id, t]) => [id, tab(apiText.get(id) ?? t)]);
  const usedStr = new Set(apiBody.flatMap(([, t]) => [...t.matchAll(/\b_[0-9a-z]+\b/g)].map((m) => m[0])));
  for (const [lit, id] of strs) if (usedStr.has(id)) api.push(`type ${id} = ${lit};`);
  for (const [id, t] of apiBody) api.push(`type ${id} = ${t};`);
  api.push("export type Decls = {");
  for (const [name, id] of decls) api.push(`${JSON.stringify(name)}: ${id};`);
  api.push("};", "");
  const apiOut = api.join("\n");
  if (out.length > 50e6) console.error(`warning: ${mod} is ${(out.length / 1e6).toFixed(0)} MB (GitHub warns above 50 MB, rejects above 100 MB)`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file + ".tmp", out);
  renameSync(file + ".tmp", file);
  const apiFile = file.replace(/\.ts$/, ".api.ts");
  writeFileSync(apiFile + ".tmp", apiOut);
  renameSync(apiFile + ".tmp", apiFile);
  return { ts: relative(outDir, file), decls: decls.map((d) => d[0]), uses: usesSorted,
    nodes: body.length - decls.length, bytes: out.length, apiBytes: apiOut.length };
}

if (isMainThread) {
  const args = process.argv.slice(2);
  const ji = args.indexOf("--jobs");
  const JOBS = ji >= 0 ? Number(args.splice(ji, 2)[1]) : Math.max(1, availableParallelism() - 2);
  const [inDir, outArg] = args;
  if (!inDir || !outArg) { console.error("usage: modts.mjs NDJSON_DIR OUT_DIR [--jobs N]"); process.exit(2); }
  const outDir = resolve(outArg);
  mkdirSync(outDir, { recursive: true });
  const manPath = join(outDir, "manifest.json");
  const manifest = existsSync(manPath) ? JSON.parse(readFileSync(manPath, "utf8")) : { modules: {} };
  const files = readdirSync(inDir).filter((f) => f.endsWith(".ndjson")).sort();
  const t0 = Date.now();

  // Pass 1: name -> module, and which modules need (re)generation.
  const owner = new Map(), todo = [], hashes = {};
  for (const f of files) {
    const mod = f.slice(0, -".ndjson".length), text = readFileSync(join(inDir, f), "utf8");
    hashes[mod] = sha1(text);
    for (const n of declNames(text)) owner.set(n, mod);
    const prev = manifest.modules[mod];
    if (!(prev && prev.ndjson === hashes[mod] && existsSync(join(outDir, prev.ts)))) todo.push(mod);
  }
  console.error(`pass 1: ${files.length} modules, ${owner.size} declarations, ${todo.length} to generate (${((Date.now() - t0) / 1000).toFixed(0)}s)`);

  // Pass 2: generate in parallel.
  const ownerArr = [...owner];
  let next = 0, done = 0;
  await new Promise((resolveAll, reject) => {
    let live = 0;
    const start = () => {
      if (next >= todo.length) { if (live === 0) resolveAll(); return; }
      live++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { inDir, outDir, ownerArr } });
      const feed = () => { if (next < todo.length) w.postMessage(todo[next++]); else w.postMessage(null); };
      w.on("message", (m) => {
        if (m.mod) {
          manifest.modules[m.mod] = { ndjson: hashes[m.mod], ...m.info };
          if (++done % 1000 === 0) console.error(`generated ${done}/${todo.length} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
        }
        feed();
      });
      w.on("error", reject);
      w.on("exit", () => { live--; if (next >= todo.length && live === 0) resolveAll(); });
    };
    for (let j = 0; j < Math.min(JOBS, todo.length); j++) start();
    if (todo.length === 0) resolveAll();
  });
  writeFileSync(manPath + ".tmp", JSON.stringify(manifest));
  renameSync(manPath + ".tmp", manPath);
  const ms = Object.values(manifest.modules);
  console.error(`done: ${done} generated, ${ms.length} modules in manifest, ${ms.reduce((a, m) => a + m.nodes, 0)} nodes, ` +
    `${(ms.reduce((a, m) => a + m.bytes, 0) / 1e9).toFixed(2)} GB of TypeScript, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
} else {
  const { inDir, outDir, ownerArr } = workerData;
  const owner = new Map(ownerArr);
  parentPort.on("message", (mod) => {
    if (mod === null) { process.exit(0); }
    const info = emitModule(mod, readFileSync(join(inDir, mod + ".ndjson"), "utf8"), owner, outDir);
    parentPort.postMessage({ mod, info });
  });
  parentPort.postMessage({});
}
