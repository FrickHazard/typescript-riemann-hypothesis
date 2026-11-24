#!/usr/bin/env bash
# Run the patched TypeScript compiler with room to recurse: an unlimited OS stack so that
# V8's large --stack-size is real (otherwise deep recursion segfaults), and a large heap
# (override with TSC_HEAP_MB).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
tsc="$here/node_modules/typescript/lib/_tsc.js"
if ! head -1 "$tsc" | grep -q "limits lifted"; then
  node "$here/tools/patch-typescript.mjs"
fi
ulimit -s unlimited
exec node --stack-size=262144 --max-old-space-size="${TSC_HEAP_MB:-8192}" "$tsc" "$@"
