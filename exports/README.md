# Lean exports

`nano-lean/` holds `lean4export` NDJSON exports (format 3.1.0, Lean 4.34.1) copied from
[sdiehl/nano-lean](https://github.com/sdiehl/nano-lean) `tests/fixtures` (MIT, see `nano-lean/LICENSE`),
each with nano-lean's expected verdict. `generated/` is produced from them:

```sh
node tools/lean2ts.mjs exports/nano-lean/smoke.ndjson exports/generated/smoke.ts
```

`tests/exports.test.ts` asserts our verdict matches nano-lean's reference checker.

## Status against all 32 nano-lean fixtures (2026-11-24)

- 18 agree (all those in `nano-lean/`).
- `forged-nat-add`: accepted, as nano-lean does without `--prelude` (needs a trusted prelude check).
- `invalid-unlisted-constructor`: wrongly accepted — inductive blocks are not validated yet.
- Hit TypeScript's instantiation-depth limit instead of answering: `frame-{valid,missing-binder,wrong-value}-{63,64,65,70}`
  (63–70 nested binders), `neutral`, `valid-deep-sparse-scope`, `projection-prop`, `invalid-nested-parameter`.

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
| `Nat.succ_add`, `Nat.add_comm`, `Nat.add_assoc`, `Nat.lt_irrefl` | 41–87 | TS instantiation-depth limit |
