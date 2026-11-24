# Scaling: how the types-only WASM runtime gets past TypeScript's limits

Research notes on [MichiganTypeScript/typescript-types-only-wasm-runtime](https://github.com/MichiganTypeScript/typescript-types-only-wasm-runtime)
("Doom in TypeScript types"), read 2026-11-24, and what it means for this kernel.

## What they do

1. **They patch the TypeScript compiler.** `patches/typescript@5.6.3.patch` (applied by pnpm's
   `patchedDependencies`) edits `lib/tsc.js` and `lib/typescript.js`:

   | Limit in the checker | Stock | Patched |
   |---|---|---|
   | `instantiationDepth` (nested generic instantiation) | 100 | `Number.MAX_SAFE_INTEGER` |
   | `instantiationCount` (per statement) | 5,000,000 | `Number.MAX_SAFE_INTEGER` |
   | tail-recursive conditional type iterations (`tailCount`) | 1,000 | `Number.MAX_SAFE_INTEGER` |
   | tuple size | 10,000 | 1e40 |
   | type-relation recursion depth | 100 | 150 |
   | `typeToString` truncation length | 160 | 1e60 |

   The limits are guards, not semantics: lifting them changes no answer TypeScript gives, it only
   lets deeper computations finish. With them gone, the real ceiling is Node's stack and heap, so
   they run `node --stack-size=8100 --max-old-space-size=8192 ... tsc`.

2. **One tail-recursive main loop over an explicit machine state.** `program.ts`'s
   `executeInstruction<state>` pops one instruction, runs a small bounded step
   (`selectInstruction`), and recurses in tail position. All interpreter state (value stack,
   call frames, locals, memory) lives in one object type, so the TS checker's own recursion
   depth stays bounded by a single instruction's work, not by the program's.

3. **Checkpointing through the compiler API** (`packages/playground/evaluate/`). A driver script
   evaluates `executeInstruction<Result, ..., stopAt>` for 50 more instructions, prints the
   resulting state with `checker.typeToString`, writes it to `result-NNNNNNNN.ts` as the next
   `type Result = ...`, and repeats; it re-spawns the Node process every 10,000 instructions
   to drop TypeScript's caches. Doom's frames were produced this way, not by one `tsc` call.

4. **A write cache for big structures.** Memory writes go to a small `L1Cache` object that is
   merged into the large memory map only every so often (`State.GarbageCollection.collect`),
   because rebuilding a huge object type on every write is expensive.

## Experiment: the patch alone on our kernel

Patching the same two constants (`tailCount`, `instantiationDepth`/`instantiationCount`) in
TypeScript 5.9's `_tsc.js`, run as `node --stack-size=65500 --max-old-space-size=8192 _tsc.js`:

| Input | Stock TS 7 | Patched TS 5.9 |
|---|---|---|
| `Nat.succ_add` (41 decls) | depth limit | accepted, 14 s |
| `Nat.add_comm` (52) | depth limit | accepted, 33 s |
| `Nat.add_assoc` (41) | depth limit | accepted, 16 s |
| `Nat.lt_irrefl` (87) | depth limit | accepted, 105 s |
| nano-lean `frame-valid-63`, `-70` | depth limit | accepted (matches nano-lean), 3 s |
| nano-lean `frame-wrong-value-63`, `-70` | depth limit | rejected, type mismatch (matches), 5–6 s |
| nano-lean `frame-missing-binder-63` | depth limit | rejected, unbound variable (matches), 2 s |

So the kernel logic was right; TypeScript's guard rails were the only blocker.

## Options for this project

- **A. Patched compiler (their approach).** Pin a JS-based TypeScript (5.9 or 6.0) and apply a
  patch on install. Cheapest by far, and verdicts are unchanged by construction. Cost: "a single
  `tsc` call" becomes "a single call to a `tsc` with its depth guards removed", which is a
  weaker claim than stock `tsc`. TS 7 is a Go binary; the same constants exist in its checker,
  but patching means building tsgo from source.
- **B. Stay within stock limits.** Rewrite whnf/defeq/infer as a tail-recursive loop over an
  explicit work stack (their point 2), so TypeScript's nesting depth no longer tracks term depth.
  Stock TS still caps one tail loop at 1,000 iterations and nesting at 100, but loops can be
  nested in a doubling pattern (`Run<Run<S, D>, D>`) to get exponentially many steps within the
  depth budget. The harder stock cap is 5,000,000 instantiations *per statement*, so each
  declaration would need checking in its own statement against a pre-built environment.
  Feasible in principle; a substantial rewrite, and unproven at Mathlib scale.
- **C. Checkpointing (their point 3).** Works with any compiler, but is many `tsc` runs driven
  by a script, which the README's single-call requirement rules out.
