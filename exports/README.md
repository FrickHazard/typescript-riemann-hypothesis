# Lean exports

`nano-lean/` holds `lean4export` NDJSON exports (format 3.1.0, Lean 4.34.1) copied from
[sdiehl/nano-lean](https://github.com/sdiehl/nano-lean) `tests/fixtures` (MIT, see `nano-lean/LICENSE`),
each with nano-lean's expected verdict. `generated/` is produced from them:

```sh
node tools/lean2ts.mjs exports/nano-lean/smoke.ndjson exports/generated/smoke.ts
```

`tests/exports.test.ts` asserts our verdict matches nano-lean's reference checker.

## Status against all 32 nano-lean fixtures (2026-11-24, patched TypeScript 6.0.3)

- 30 agree with nano-lean's reference verdict (all those in `nano-lean/`; `projection-prop` is in the slow suite).
- `forged-nat-add`: accepted, as nano-lean does without `--prelude` (needs a trusted prelude check).
- `invalid-unlisted-constructor`: wrongly accepted — inductive blocks are not validated yet.
- `neutral`: no answer within 15 minutes (kernel performance; nano-lean caches whnf/defeq, we don't yet).

## Our own exports from Lean core (`lean/`)

Exported with `tools/export-lean.sh Init <decl>` (lean4export 3.1.0 built against Lean 4.37.0-rc1,
the toolchain of riemann-hypothesis and its pinned mathlib `31ce06e`). Each file is the
declaration plus its full dependency closure.

| Lemma | Kernel decls (closure) | Result |
|---|---|---|
| `Nat.add_zero` | 38 | accepted (and `n + 1 = n` mutation rejected) |
| `Nat.zero_add` | 43 | accepted |
| `Nat.le_refl` | 14 | accepted |
| `Nat.mul_one` | 57 | accepted |
| `Nat.succ_ne_zero` | 74 | accepted |
| `Nat.succ_add` | 41 | accepted |
| `Nat.add_comm` | 52 | accepted |
| `Nat.add_assoc` | 41 | accepted |
| `Nat.lt_irrefl` | 87 | accepted (slow suite, ~105 s) |

## Mathlib (`31ce06e`, the riemann-hypothesis pin) and riemann-hypothesis leaves

Mathlib's prebuilt cache was fetched inside `../riemann-hypothesis` with
`MATHLIB_CACHE_GET_URL=https://cache.mathlib.org/mathlib4 lake exe mathlib/cache get`
(Mathlib only; the riemann-hypothesis prebuilt cache is not used). Riemann-hypothesis modules
are compiled locally: `lake build <Module>`. Then
`LEAN_PROJECT=../riemann-hypothesis tools/export-lean.sh <Module> <decl>`.
At this Mathlib revision the logic basics live in `Mathlib.Basic.Logic.Basic`.

Checked one at a time with the patched compiler (2026-11-24):

| Declaration | Source | Kernel decls | Result |
|---|---|---|---|
| `eq_comm_eq` | Mathlib.Basic.Logic.Basic (`rw`) | 15 | accepted, 2 s; wrong-proof mutation rejected |
| `Fact.elim` | Mathlib.Basic.Logic.Basic | 5 | accepted, <1 s |
| `Imp.swap` | Mathlib.Basic.Logic.Basic | 4 | accepted, 1 s |
| `Or.elim3` | Mathlib.Basic.Logic.Basic | 8 | accepted, 1 s |
| `em'` | Mathlib.Basic.Logic.Basic (classical) | 130 | accepted, 216 s |
| `of_not_not` | Mathlib.Basic.Logic.Basic (classical) | 136 | accepted, 218 s |
| `not_imp_comm` | Mathlib.Basic.Logic.Basic (classical) | 137 | accepted, 216 s |
| `xor_comm` | Mathlib.Basic.Logic.Basic (`grind`) | 173 | accepted, 228 s |
| `Bl.general_b_fact_bis.goal1` | riemann-hypothesis `Lemmata/GeneralBFactBis/Imports.lean` | 968 | no verdict after 85 min (likely out of heap at 8 GB, CPU shared with the build) |
| `GroundTheory.GroupCoh.coe_conjHom_apply` | riemann-hypothesis `GroundTheory/TateCohomology/ConjAction.lean` (`rfl`) | 642 | exported, not yet checked |

Closure sizes of 15 measured riemann-hypothesis leaf theorems range from 642 to 36,007 kernel
declarations; `coe_conjHom_apply` is the smallest found.
