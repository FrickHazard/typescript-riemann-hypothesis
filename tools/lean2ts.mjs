#!/usr/bin/env node
// Convert a lean4export NDJSON export (format 3.x, the input nano-lean checks)
// into a TypeScript module the type-level kernel can check.
//
//   node tools/lean2ts.mjs IN.ndjson OUT.ts
//
// The export is a DAG: names (`in`), levels (`il`) and expressions (`ie`) are
// numbered and refer to earlier entries. Each entry becomes a named type alias,
// so shared subterms stay shared in the TypeScript checker too.
//
// Mirrors nano-lean's importer (src/import/json.rs): unsafe/partial declarations
// are refused, since a safe proof export must not contain them.

import { readFileSync, writeFileSync } from "node:fs";
import { relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let inPath = "<input>";
let names, lines, decls, items, meta;

const fail = (msg) => {
  throw new Error(`${inPath}: ${msg}`);
};
const lit = (s) => JSON.stringify(s);
const name = (i) => {
  if (!names.has(i)) fail(`unknown name #${i}`);
  return names.get(i);
};
const lvl = (i) => (i === 0 ? "LZero" : `U${i}`);
const expr = (i) => `E${i}`;
const strs = (is) => `[${is.map((i) => lit(name(i))).join(", ")}]`;

function nameEntry(o) {
  const i = o.in;
  if (o.str) names.set(i, (name(o.str.pre) ? name(o.str.pre) + "." : "") + o.str.str);
  else if (o.num) names.set(i, (name(o.num.pre) ? name(o.num.pre) + "." : "") + o.num.i);
  else fail(`unknown name entry ${JSON.stringify(o)}`);
}

function levelEntry(o) {
  const i = o.il;
  let rhs;
  if ("param" in o) rhs = `LParam<${lit(name(o.param))}>`;
  else if ("succ" in o) rhs = `LSucc<${lvl(o.succ)}>`;
  else if ("max" in o) rhs = `LMax<${lvl(o.max[0])}, ${lvl(o.max[1])}>`;
  else if ("imax" in o) rhs = `LIMax<${lvl(o.imax[0])}, ${lvl(o.imax[1])}>`;
  else fail(`unknown level entry ${JSON.stringify(o)}`);
  lines.push(`type U${i} = ${rhs};`);
  items.push({ alias: `U${i}`, rhs });
}

function exprEntry(o) {
  const i = o.ie;
  let rhs;
  if ("bvar" in o) rhs = `B<${o.bvar}>`;
  else if ("sort" in o) rhs = `Sort<${lvl(o.sort)}>`;
  else if ("const" in o) rhs = `Const<${lit(name(o.const.name))}, [${o.const.us.map(lvl).join(", ")}]>`;
  else if ("app" in o) rhs = `App<${expr(o.app.fn)}, ${expr(o.app.arg)}>`;
  else if ("lam" in o) rhs = `Lam<${expr(o.lam.type)}, ${expr(o.lam.body)}>`;
  else if ("forallE" in o) rhs = `Pi<${expr(o.forallE.type)}, ${expr(o.forallE.body)}>`;
  else if ("letE" in o) rhs = `Let<${expr(o.letE.type)}, ${expr(o.letE.value)}, ${expr(o.letE.body)}>`;
  else if ("proj" in o) rhs = `Proj<${lit(name(o.proj.typeName))}, ${o.proj.idx}, ${expr(o.proj.struct)}>`;
  else if ("natVal" in o) rhs = `NatLit<${lit(String(o.natVal))}>`;
  else if ("strVal" in o) rhs = `StrLit<${lit(o.strVal)}>`;
  else if ("mdata" in o) rhs = expr(o.mdata.expr); // metadata is irrelevant to the kernel
  else fail(`unknown expression entry ${JSON.stringify(o)}`);
  lines.push(`type E${i} = ${rhs};`);
  items.push({ alias: `E${i}`, rhs });
}

const hint = (h) => {
  if (h === "opaque" || h === "abbrev") return lit(h);
  if (h && typeof h.regular === "number") return String(h.regular);
  fail(`invalid reducibility hint ${JSON.stringify(h)}`);
};

function declaration(kind, d) {
  const start = decls.length;
  declarationInner(kind, d);
  for (const ts of decls.slice(start)) items.push({ decl: ts, name: ts.match(/^[A-Za-z]+<("(?:[^"\\]|\\.)*")/)[1] });
}

function declarationInner(kind, d) {
  const info = () => `${lit(name(d.name))}, ${strs(d.levelParams)}, ${expr(d.type)}`;
  switch (kind) {
    case "def":
      if (d.safety !== "safe") fail(`${d.safety} definition ${name(d.name)} in a safe proof export`);
      decls.push(`Defn<${info()}, ${expr(d.value)}, ${hint(d.hints)}>`);
      break;
    case "thm":
      decls.push(`Thm<${info()}, ${expr(d.value)}>`);
      break;
    case "axiom":
      if (d.isUnsafe) fail(`unsafe axiom ${name(d.name)}`);
      decls.push(`Axiom<${info()}>`);
      break;
    case "opaque":
      if (d.isUnsafe) fail(`unsafe opaque ${name(d.name)}`);
      decls.push(`Opaque<${info()}, ${expr(d.value)}>`);
      break;
    case "quot":
      decls.push(`QuotDecl<${info()}>`);
      break;
    case "inductive":
      for (const t of d.types) {
        if (t.isUnsafe) fail(`unsafe inductive ${name(t.name)}`);
        decls.push(`Induct<${lit(name(t.name))}, ${strs(t.levelParams)}, ${expr(t.type)}, ` +
          `{ numParams: ${t.numParams}; numIndices: ${t.numIndices}; ctors: ${strs(t.ctors)}; ` +
          `isRec: ${t.isRec}; all: ${strs(t.all)} }>`);
      }
      for (const c of d.ctors) {
        if (c.isUnsafe) fail(`unsafe constructor ${name(c.name)}`);
        decls.push(`Ctor<${lit(name(c.name))}, ${strs(c.levelParams)}, ${expr(c.type)}, ` +
          `{ induct: ${lit(name(c.induct))}; cidx: ${c.cidx}; numParams: ${c.numParams}; numFields: ${c.numFields} }>`);
      }
      for (const r of d.recs) {
        if (r.isUnsafe) fail(`unsafe recursor ${name(r.name)}`);
        const rules = r.rules.map((x) => `RecRule<${lit(name(x.ctor))}, ${x.nfields}, ${expr(x.rhs)}>`);
        decls.push(`Rec<${lit(name(r.name))}, ${strs(r.levelParams)}, ${expr(r.type)}, ` +
          `{ numParams: ${r.numParams}; numIndices: ${r.numIndices}; numMotives: ${r.numMotives}; ` +
          `numMinors: ${r.numMinors}; k: ${r.k}; all: ${strs(r.all)}; rules: [${rules.join(", ")}] }>`);
      }
      break;
    default:
      fail(`unsupported declaration kind ${kind}`);
  }
}

/** Parse an export into an ordered stream of `{alias, rhs}` and `{decl, name}` items. */
export function convert(text, path = "<input>") {
  names = new Map([[0, ""]]); meta = null;
  return feed(text, path);
}

/**
 * Continue converting a stream that shares numbering with what was fed before (the
 * export server's output): names stay known across calls; returns only the new items.
 */
export function feed(text, path = "<input>") {
  inPath = path;
  if (!names) names = new Map([[0, ""]]);
  lines = []; decls = []; items = [];
  for (const [n, raw] of text.split("\n").entries()) {
  if (!raw.trim()) continue;
  const o = JSON.parse(raw);
  if (o.meta) { meta = o.meta; continue; }
  if ("ready" in o || "batchEnd" in o) continue;
  if ("in" in o) nameEntry(o);
  else if ("il" in o) levelEntry(o);
  else if ("ie" in o) exprEntry(o);
  else {
    const keys = Object.keys(o);
    if (keys.length !== 1) fail(`malformed declaration entry on line ${n + 1}`);
    declaration(keys[0], o[keys[0]]);
  }
  }
  return { meta, lines, decls, items };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
const cliArgs = process.argv.slice(2);
const inline = cliArgs.includes("--inline");
const [inArg, outPath] = cliArgs.filter((a) => a !== "--inline");
if (!inArg || !outPath) {
  console.error("usage: node tools/lean2ts.mjs IN.ndjson OUT.ts");
  process.exit(2);
}
convert(readFileSync(inArg, "utf8"), inArg);
if (inline) {
  // Rebuild the alias lines and declarations from the inlined item stream.
  const it2 = inlineItems(items);
  lines = it2.filter((x) => x.alias).map((x) => `type ${x.alias} = ${x.rhs};`);
  decls = it2.filter((x) => x.decl).map((x) => x.decl);
}

let src = relative(dirname(outPath), "src/index").replaceAll("\\", "/");
if (!src.startsWith(".")) src = "./" + src;
const out = `// Generated by tools/lean2ts.mjs from ${relative(process.cwd(), inPath)}. Do not edit.
${meta ? `// Lean ${meta.lean?.version ?? "?"}, exporter ${meta.exporter?.name ?? "?"} ${meta.exporter?.version ?? "?"}\n` : ""}
import type {
  LZero, LSucc, LMax, LIMax, LParam,
  B, Sort, Const, App, Lam, Pi, Let, Proj, NatLit, StrLit,
  Axiom, Defn, Thm, Opaque, QuotDecl, Induct, Ctor, Rec, RecRule,
  CheckEnv,
} from "${src}";

${lines.join("\n")}

export type Decls = [
${decls.map((d) => "  " + d + ",").join("\n")}
];

export type Result = CheckEnv<Decls>;
`;
writeFileSync(outPath, out);
console.error(`${outPath}: ${decls.length} declarations, ${lines.length} DAG nodes`);
}

/**
 * Inline DAG nodes that are used once (or are tiny) into their single user, so only shared
 * nodes get a named type alias. Measured on RH modules, ~85% of nodes are used exactly once.
 * `items` is convert()/feed() output with export-local names (E12, U3); returns the same
 * shape with fewer aliases. Inlining stops at depth `maxDepth` so the TypeScript parser and
 * checker never see very deep literal types. Aliases that remain keep their export names.
 */
export function inlineItems(items, { maxDepth = 24, tiny = 24 } = {}) {
  const REFS = /"(?:[^"\\]|\\.)*"|\b([EU]\d+)\b/g;
  const uses = new Map();
  const count = (s) => { for (const m of s.matchAll(REFS)) if (m[1]) uses.set(m[1], (uses.get(m[1]) ?? 0) + 1); };
  for (const it of items) count(it.alias ? it.rhs : it.decl);
  const inl = new Map(); // alias -> { text, depth } for inlined nodes
  const subst = (s) => {
    let depth = 0;
    const text = s.replace(REFS, (m, r) => {
      if (!r) return m;
      const x = inl.get(r);
      if (!x) return r;
      if (x.depth > depth) depth = x.depth;
      return x.text;
    });
    return { text, depth: depth + 1 };
  };
  const out = [];
  for (const it of items) {
    if (it.alias) {
      const { text, depth } = subst(it.rhs);
      if (depth <= maxDepth && ((uses.get(it.alias) ?? 0) <= 1 || text.length <= tiny)) inl.set(it.alias, { text, depth });
      else out.push({ alias: it.alias, rhs: text });
    } else out.push({ decl: subst(it.decl).text, name: it.name });
  }
  return out;
}
