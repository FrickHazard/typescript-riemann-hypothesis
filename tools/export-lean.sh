#!/usr/bin/env bash
# Export Lean declarations (with their dependency closure) and convert them for the TS kernel.
#   tools/export-lean.sh MODULE DECL...      e.g. tools/export-lean.sh Init Nat.add_zero
# Needs ../lean4export built with this project's Lean version (v4.37.0-rc1, matching
# riemann-hypothesis and its pinned mathlib). Run from a directory whose `lake env`
# can see MODULE: core modules (Init) work anywhere; Mathlib needs LEAN_PROJECT=../mathlib4.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
exporter="$here/../lean4export/.lake/build/bin/lean4export"
project="${LEAN_PROJECT:-$here/../lean4export}"
module="$1"; shift
for decl in "$@"; do
  out="$here/exports/lean/$decl.ndjson"
  (cd "$project" && lake env "$exporter" "$module" -- "$decl") > "$out"
  node "$here/tools/lean2ts.mjs" "$out" "$here/exports/generated/$decl.ts"
done
