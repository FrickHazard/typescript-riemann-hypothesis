#!/usr/bin/env node
// Lift TypeScript's type-instantiation guard limits (option A in docs/scaling.md), as the
// types-only WASM runtime does. These limits are guards, not semantics: removing them changes
// no answer the checker gives, it only lets deeper computations finish.
//
// Runs on `npm install` (postinstall). Idempotent. Fails loudly if TypeScript is not the
// exact version this patch was written for, or if the expected code is not found.

import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const VERSION = "6.0.3";
const MARKER = "/* typescript-riemann-hypothesis: limits lifted */";
const require = createRequire(import.meta.url);
const pkg = require("typescript/package.json");
if (pkg.version !== VERSION) {
  console.error(`patch-typescript: expected typescript ${VERSION}, found ${pkg.version}`);
  process.exit(1);
}

const edits = [
  // tail-recursive conditional type evaluation: 1000 iterations
  ["if (tailCount === 1e3) {", "if (tailCount === Number.MAX_SAFE_INTEGER) {"],
  // nested instantiation depth 100, and 5M instantiations per statement
  ["if (instantiationDepth === 100 || instantiationCount >= 5e6) {",
   "if (instantiationDepth === Number.MAX_SAFE_INTEGER || instantiationCount >= Number.MAX_SAFE_INTEGER) {"],
];

for (const file of ["lib/_tsc.js", "lib/typescript.js"]) {
  const path = require.resolve(`typescript/${file}`);
  let src = readFileSync(path, "utf8");
  if (src.startsWith(MARKER)) continue;
  for (const [from, to] of edits) {
    const n = src.split(from).length - 1;
    if (n !== 1) {
      console.error(`patch-typescript: expected exactly one "${from}" in ${file}, found ${n}`);
      process.exit(1);
    }
    src = src.replace(from, to);
  }
  writeFileSync(path, MARKER + "\n" + src);
  console.error(`patch-typescript: patched ${file}`);
}
