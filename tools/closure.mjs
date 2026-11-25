#!/usr/bin/env node
// Rank declarations by dependency-closure size (smallest first), from tools/deps.lean output.
//   node --max-old-space-size=16384 tools/closure.mjs DEPS.tsv [CAP=5000] > ORDER.tsv
// Writes: size <TAB> kind <TAB> name, for every constant whose closure (itself included)
// has at most CAP members, ascending; larger ones are only counted (stderr). A closure
// contains its dependencies' closures, so ascending size is a valid checking order.
//
// Scales to millions of constants: edges are stored in typed arrays (CSR), constants are
// visited in dependency order, and a constant with any dependency already over CAP is
// over CAP itself without a search. Exact closures are counted by bounded DFS.
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const [, , path, capArg] = process.argv;
const CAP = Number(capArg ?? 5000);
const ids = new Map(), names = [], kinds = [];
const id = (n) => { let i = ids.get(n); if (i === undefined) { i = names.length; ids.set(n, i); names.push(n); kinds.push("?"); } return i; };

// Pass 1: parse into growable Int32 edge buffers.
let edges = new Int32Array(1 << 24), ne = 0;
const starts = [], owners = [];
for await (const line of createInterface({ input: createReadStream(path), crlfDelay: Infinity })) {
  if (!line) continue;
  const t1 = line.indexOf("\t"), t2 = line.indexOf("\t", t1 + 1);
  const i = id(line.slice(0, t1));
  kinds[i] = line.slice(t1 + 1, t2);
  owners.push(i); starts.push(ne);
  const ds = line.slice(t2 + 1);
  if (ds) for (const d of ds.split(" ")) {
    if (ne === edges.length) { const e2 = new Int32Array(edges.length * 2); e2.set(edges); edges = e2; }
    edges[ne++] = id(d);
  }
}
const N = names.length;
const off = new Int32Array(N + 1), cnt = new Int32Array(N);
for (let k = 0; k < owners.length; k++) cnt[owners[k]] = (k + 1 < owners.length ? starts[k + 1] : ne) - starts[k];
for (let i = 0; i < N; i++) off[i + 1] = off[i] + cnt[i];
const adj = new Int32Array(ne);
for (let k = 0; k < owners.length; k++) adj.set(edges.subarray(starts[k], starts[k] + cnt[owners[k]]), off[owners[k]]);
edges = null;
console.error(`${N} constants, ${ne} edges`);

// Pass 2: collapse cycles (an inductive block's types, constructors and recursors depend
// on each other) into strongly connected components, iterative Tarjan.
const comp = new Int32Array(N).fill(-1), low = new Int32Array(N), idx = new Int32Array(N).fill(-1);
const tstack = new Int32Array(N), onst = new Uint8Array(N), cstack = new Int32Array(N), cedge = new Int32Array(N);
let tsp = 0, counter = 0, ncomp = 0;
for (let root = 0; root < N; root++) {
  if (idx[root] >= 0) continue;
  let csp = 0; cstack[csp] = root; cedge[csp] = off[root]; csp++;
  idx[root] = low[root] = counter++; tstack[tsp++] = root; onst[root] = 1;
  while (csp > 0) {
    const v = cstack[csp - 1];
    if (cedge[csp - 1] < off[v + 1]) {
      const w = adj[cedge[csp - 1]++];
      if (idx[w] < 0) { idx[w] = low[w] = counter++; tstack[tsp++] = w; onst[w] = 1; cstack[csp] = w; cedge[csp] = off[w]; csp++; }
      else if (onst[w] && idx[w] < low[v]) low[v] = idx[w];
    } else {
      csp--;
      if (csp > 0) { const u = cstack[csp - 1]; if (low[v] < low[u]) low[u] = low[v]; }
      if (low[v] === idx[v]) { let w; do { w = tstack[--tsp]; onst[w] = 0; comp[w] = ncomp; } while (w !== v); ncomp++; }
    }
  }
}
// Tarjan numbers components in reverse topological order: dependencies first. Component
// members, and condensed edges, in CSR form.
const mOff = new Int32Array(ncomp + 1);
for (let i = 0; i < N; i++) mOff[comp[i] + 1]++;
for (let c = 0; c < ncomp; c++) mOff[c + 1] += mOff[c];
const mem = new Int32Array(N), mf = mOff.slice(0, ncomp);
for (let i = 0; i < N; i++) mem[mf[comp[i]]++] = i;

// Pass 3: bounded exact closure counts over components, dependencies first; a component
// with any dependency already over CAP is over CAP without a search.
const size = new Int32Array(ncomp); // CAP+1 = over
const stamp = new Int32Array(ncomp).fill(-1), stack = new Int32Array(ncomp);
let over = 0;
for (let c = 0; c < ncomp; c++) {
  let big = false;
  for (let k = mOff[c]; k < mOff[c + 1] && !big; k++) {
    const v = mem[k];
    for (let e = off[v]; e < off[v + 1]; e++) { const d = comp[adj[e]]; if (d !== c && size[d] > CAP) { big = true; break; } }
  }
  if (big) { size[c] = CAP + 1; over++; continue; }
  let sp = 0, s = 0; stack[sp++] = c; stamp[c] = c;
  while (sp > 0 && s <= CAP) {
    const x = stack[--sp]; s += mOff[x + 1] - mOff[x];
    for (let k = mOff[x]; k < mOff[x + 1]; k++) {
      const v = mem[k];
      for (let e = off[v]; e < off[v + 1]; e++) { const d = comp[adj[e]]; if (stamp[d] !== c) { stamp[d] = c; stack[sp++] = d; } }
    }
  }
  size[c] = s > CAP ? CAP + 1 : s;
  if (s > CAP) over++;
}

// Output members of in-cap components, ascending by closure size; ties keep dependency
// order (component number), so the output is always a valid checking order.
const cs = [];
for (let c = 0; c < ncomp; c++) if (size[c] <= CAP) cs.push(c);
cs.sort((a, b) => size[a] - size[b] || a - b);
const chunks = [];
let members = 0;
for (const c of cs) for (let k = mOff[c]; k < mOff[c + 1]; k++) { const i = mem[k]; chunks.push(`${size[c]}\t${kinds[i]}\t${names[i]}\n`); members++; }
process.stdout.write(chunks.join(""));
const hist = {};
for (const c of cs) { const s = size[c], b = s <= 10 ? "1-10" : s <= 100 ? "11-100" : s <= 1000 ? "101-1000" : `1001-${CAP}`; hist[b] = (hist[b] ?? 0) + (mOff[c + 1] - mOff[c]); }
console.error(`${ncomp} components; constants by closure size ${JSON.stringify(hist)}; over ${CAP}: ${N - members}`);
