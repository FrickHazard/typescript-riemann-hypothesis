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

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node tools/lean2ts.mjs IN.ndjson OUT.ts");
  process.exit(2);
}

const names = new Map([[0, ""]]); // name index -> dotted string
const lines = []; // emitted alias lines
const decls = []; // emitted declaration type expressions
let meta = null;

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
}

const hint = (h) => {
  if (h === "opaque" || h === "abbrev") return lit(h);
  if (h && typeof h.regular === "number") return String(h.regular);
  fail(`invalid reducibility hint ${JSON.stringify(h)}`);
};

function declaration(kind, d) {
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

const text = readFileSync(inPath, "utf8");
for (const [n, raw] of text.split("\n").entries()) {
  if (!raw.trim()) continue;
  const o = JSON.parse(raw);
  if (n === 0 && o.meta) { meta = o.meta; continue; }
  if ("in" in o) nameEntry(o);
  else if ("il" in o) levelEntry(o);
  else if ("ie" in o) exprEntry(o);
  else {
    const keys = Object.keys(o);
    if (keys.length !== 1) fail(`malformed declaration entry on line ${n + 1}`);
    declaration(keys[0], o[keys[0]]);
  }
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
