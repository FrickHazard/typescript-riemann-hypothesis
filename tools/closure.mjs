#!/usr/bin/env node
// Rank declarations by dependency-closure size (smallest first), from tools/deps.lean output.
//   node tools/closure.mjs DEPS.tsv [CAP=5000] > SIZES.tsv
// Writes: size <TAB> kind <TAB> name, for every constant whose closure (itself included)
// has at most CAP members; larger ones are counted in a summary on stderr. A closure
// contains its dependencies' closures, so ascending size is a valid checking order.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [, , path, capArg] = process.argv;
const CAP = Number(capArg ?? 5000);
const ids = new Map(), names = [], kinds = [], deps = [];
const id = (n) => {
  let i = ids.get(n);
  if (i === undefined) { i = names.length; ids.set(n, i); names.push(n); kinds.push("?"); deps.push([]); }
  return i;
};
for await (const line of createInterface({ input: createReadStream(path) })) {
  if (!line) continue;
  const [name, kind, ds = ""] = line.split("\t");
  const i = id(name);
  kinds[i] = kind;
  deps[i] = ds ? ds.split(" ").map(id) : [];
}
const N = names.length, stamp = new Int32Array(N).fill(-1), stack = new Int32Array(N);
const out = [];
let big = 0;
for (let r = 0; r < N; r++) {
  let sp = 0, size = 0;
  stack[sp++] = r; stamp[r] = r;
  while (sp > 0 && size <= CAP) {
    const v = stack[--sp]; size++;
    for (const w of deps[v]) if (stamp[w] !== r) { stamp[w] = r; stack[sp++] = w; }
  }
  if (size <= CAP) out.push([size, kinds[r], names[r]]); else big++;
}
out.sort((a, b) => a[0] - b[0] || (a[2] < b[2] ? -1 : 1));
for (const [s, k, n] of out) process.stdout.write(`${s}\t${k}\t${n}\n`);
const hist = {};
for (const [s] of out) { const b = s <= 10 ? "1-10" : s <= 100 ? "11-100" : s <= 1000 ? "101-1000" : `1001-${CAP}`; hist[b] = (hist[b] ?? 0) + 1; }
console.error(`${N} constants; closure size ${JSON.stringify(hist)}; >${CAP}: ${big}`);
