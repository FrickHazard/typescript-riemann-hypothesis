# typescript-riemann-hypothesis

Proving the Riemann Hypothesis in Typescript type system

Requirements all files in .ts, a single tsc call verifies the Riemann Hypothesis is true

Task Break down:
1. Implement LEAN kernel in Typescript types (Calculus of Inductive Construction)
3. Add hook to a LEAN compiler to intercept base types received by LEAN kernel during Riemann hypothesis proof
4. Convert hook interception to ts file
5. Come up with DAG structure to not OOM tsc, maybe compression as well
6. Import code from MathLib, or dedupe from hook. Riemman proof uses some libraries from MathLib.

Helpful resources:
* A repo that implements WASM in Typescript Types: https://github.com/MichiganTypeScript/typescript-types-only-wasm-runtime
* List and benchmark for LEAN kernels: https://github.com/leanprover/lean-kernel-arena
* The community REPO with clean up for LEAN proof: https://github.com/leanprover-community/riemann-hypothesis/tree/main
* LEAN MathLib : https://github.com/leanprover-community/mathlib4

## Development

```sh
npm install          # also patches TypeScript's instantiation limits (docs/scaling.md)
npm run check        # kernel tests + real Lean exports, ~3 min
npm run check:slow   # heavier exports, ~7 min
```

Lean exports: `tools/export-lean.sh Init Nat.add_comm` (see exports/README.md).

## Progress (2026-11-25)

Lean kernel in TS types modeled on nano-lean (levels, whnf/defeq/infer, inductives with iota/K/structure eta, Nat literals; inductive blocks not yet validated) → `tools/lean2ts.mjs` converts lean4export exports → verified real Lean core and Mathlib lemmas and 30/32 nano-lean fixtures with one patched `tsc` (TypeScript 6.0.3) → built the riemann-hypothesis proof locally (59,828 modules, 11.4 h), ranked its 1.41M constants by dependency closure, and checked the 9,307 smallest as incremental `tsc -b` projects (`tools/batch.mjs`, persistent `tools/ExportServer.lean`) → generating the entire proof as TS projects (`tools/genall.mjs`, in progress).

## Recipe: reproduce everything

Pins: Lean `v4.37.0-rc1`; [riemann-hypothesis](https://github.com/leanprover-community/riemann-hypothesis) `9282d3a102c4aff0e6026746db2a8990f5d9cddd`, which pins Mathlib `31ce06eaadf4a200c0e1407c5f10953cf606b8f8`; [lean4export](https://github.com/leanprover/lean4export) `df81913eee5519d5a88ae5b0fd701b5298cc29ab` (format 3.1.0); Node 26; `typescript@6.0.3`. Kernel design reference: [nano-lean](https://github.com/sdiehl/nano-lean) `5cd4a25`. All repos are siblings of this one. Times are for an i7-8700K (6 cores), 46 GB RAM, SATA SSD.

```sh
# 0. Tools: elan (Lean), then this repo's deps (installs and patches TypeScript)
curl -sSfL https://raw.githubusercontent.com/leanprover/elan/master/elan-init.sh | sh -s -- -y --default-toolchain none
npm install

# 1. Sources
git clone https://github.com/leanprover-community/riemann-hypothesis ../riemann-hypothesis
git -C ../riemann-hypothesis checkout 9282d3a102c4aff0e6026746db2a8990f5d9cddd
git clone https://github.com/leanprover/lean4export ../lean4export
git -C ../lean4export checkout df81913eee5519d5a88ae5b0fd701b5298cc29ab
echo "leanprover/lean4:v4.37.0-rc1" > ../lean4export/lean-toolchain     # must match the .olean files
cp tools/ExportServer.lean ../lean4export/
printf '\n[[lean_exe]]\nname = "exportserver"\nroot = "ExportServer"\n' >> ../lean4export/lakefile.toml
(cd ../lean4export && lake build lean4export exportserver)

# 2. Mathlib's official cache, then compile the proof ourselves (Lean's kernel checks it)
(cd ../riemann-hypothesis && MATHLIB_CACHE_GET_URL=https://cache.mathlib.org/mathlib4 lake exe mathlib/cache get)  # 7.8 GB
(cd ../riemann-hypothesis && lake build Main)  # ~11.4 h, 59,828 modules, 223 GB (164 GB of it .setup.json, safe to delete)

# 3. Dependency graph of the five target theorems, ranked smallest closure first
(cd ../riemann-hypothesis && lake env lean --run ../typescript-riemann-hypothesis/tools/deps.lean \
  Main ../rh-deps.tsv $(cat export-targets.txt))                          # ~16 min, 1.41M constants, 2.6 GB
node --max-old-space-size=20000 tools/closure.mjs ../rh-deps.tsv 5000 --all > ../rh-order-all.tsv   # ~1 min

# 4a. Write the whole proof as TypeScript projects (no checking): hours, disk-bound, 50+ GB
node --max-old-space-size=20000 tools/genall.mjs ../rh-order-all.tsv ../rh-ts-full --size 300 --thm-as-axiom
# 4b. Or check incrementally, smallest first, one tsc -b project per batch
node --max-old-space-size=20000 tools/closure.mjs ../rh-deps.tsv 5000 > ../rh-order.tsv
node tools/batch.mjs init ../rh-ts ../rh-order.tsv
TSC_HEAP_MB=12000 node tools/batch.mjs run ../rh-ts --size 300 --count 40 --thm-as-axiom
```

### Existing servers and checkers for this proof

- **Mathlib cache**: `https://cache.mathlib.org/mathlib4` (official prebuilt Mathlib; used in step 2).
- **riemann-hypothesis cache**: `https://rh-cache.taucetiproject.org` (Cloudflare R2), fetched by `lake exe cache get` in that repo; replaces the 11 h build with a download. Its docs note it includes outputs from untrusted pull requests and volunteer machines; that cannot make our kernel accept a false proof (every exported declaration is re-checked), only make us check the wrong thing, so pin the revision. See its `verification/CACHE.md`.
- **Original published build**: [JackMcCarthy/riemann-hypothesis-build](https://huggingface.co/datasets/JackMcCarthy/riemann-hypothesis-build/tree/9036e64326acf4acfae159b96664e9708445c1d1) on Hugging Face (Lean 4.33.1 source).
- **Independent checks already run by that project**: `lake comparator` checks `Main` proves exactly the statements in `Challenge.lean` with only `propext`, `Quot.sound`, `Classical.choice`, and that Lean's kernel and [nanoda](https://github.com/ammkrn/nanoda_lib) accept it.

## Future work: compressing proofs in the hook

Today the hook (`tools/lean2ts.mjs` and the project generators) is a faithful 1:1 transcription of the exported Lean proof terms. It should eventually rewrite them before emitting TypeScript, to meet two goals at once:

1. **Smaller TypeScript**: fewer bytes of `.ts`/`.d.ts` and fewer type aliases.
2. **Faster verification by `tsc`**: fewer and cheaper type instantiations for the kernel.

This optimization has to work across the whole proof, outside Lean module (and batch/project) boundaries, not one module at a time: the compression opportunities, such as subterms, instance chains or proof patterns repeated in declarations of many different modules, only show up globally. Candidate techniques: global hash-consing beyond what the export already shares; factoring repeated subterms into shared definitions, abstracted over their free variables and placed where all their users can import them; equivalent encodings that `tsc` evaluates faster (see `docs/scaling.md`); and pre-normalizing terms where that makes checking cheaper. The project layout would then follow the compressed DAG rather than export order.

Soundness constraint: the kernel still checks every rewritten declaration, and a rewrite is only allowed if the original statement follows from it by the kernel's own definitional unfolding, so compression can never change what is proved.

**Using compressors as a signal.** gzip/zstd can point at shared type structure, but not on the raw output: on generated RH projects, one project compresses 5-6.5x (gzip -9), yet three ~18 MB projects compress only 0.5% better together than separately even with a 128 MB window (`zstd --long=27`). The export is already a DAG, so identical subterms are shared once; what repeats across modules are near-identical terms that differ in a few children, and unique node ids hide them from a compressor. The signal comes from canonicalizing first: rewrite each child reference as a fingerprint of its subtree up to depth k (shape and constant names, not node ids), then measure compressibility or count repeated fingerprints, globally. Terms that agree down to depth k then look identical, so the ratio (and the most frequent fingerprints) estimate what abstracting over the differing parts could save, and where; varying k shows how deep the sharing goes. (Erasing references outright is not a usable signal: it makes every line one of a few shapes and compresses ~200x trivially.)
