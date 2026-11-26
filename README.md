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

**Smaller edition (2026-11-26).** `leanprover-community/riemann-hypothesis` `main` is now the 806-file readable edition of [lsernau/grh-lean](https://github.com/lsernau/grh-lean) (Lean v4.35.0, Mathlib `56a005855ea17e0b0958f73ec801ae140b0a1679`, commit `d1a89786248472c61263785a6fe60d9fec66afc2`), same five theorems and axioms. Through the same pipeline (export tools rebuilt for v4.35.0):

| | old (59,869 files, `9282d3a1`) | new (806 files, `d1a89786`) |
|---|---|---|
| Lean build | 11.4 h | 74 min |
| Closure | 1,409,262 constants | 222,119 |
| Per-module export | ~45 min, 77 GB NDJSON | 2 min 15 s, 4.7 GB |
| TypeScript (format v2) | 64,290 files, 23.6 GB, 4.89 GB compressed | 5,394 files, 1.43 GB, 0.30 GB compressed |

In the new closure, the riemann-hypothesis modules are 64% of the NDJSON (803 modules, 3.0 GB) and Mathlib 15% (4,420 modules, 0.7 GB).

## Pipeline artifacts: NDJSON vs TypeScript

The proof passes through two encodings of the same content:

| | NDJSON (`../rh-ndjson/<Module>.ndjson`) | TypeScript (`../rh-ts/ts/<Module path>.ts`) |
|---|---|---|
| Produced by | `tools/ModExport.lean` reading the `.olean` files (Lean) | `tools/modts.mjs` from the NDJSON (Node) |
| What it is | Lean's kernel data (`Expr`, `ConstantInfo`) in lean4export format: one JSON object per line (a name, level, expression node or declaration), referring to earlier lines by number | the same terms as type aliases and `Thm<...>`/`Defn<...>` declarations, which `tsc` checks by evaluating them through the kernel in `src/` |
| Example node | `{"ie":8,"app":{"fn":7,"arg":2}}` | `export type H8f3a91c2d0e4b7a1 = App<H1c2d..., H7e9f...>;` |
| Node names | numbers, local to each module file | content hashes, identical everywhere |
| Extras | none | imports between modules, `Decls` tables; later, environments and check statements |
| Cost to regenerate | needs Lean and the ~33 GB environment (~45 min for the RH proof) | fast and parallel, from the NDJSON alone |
| Role | durable snapshot of the proof terms; keep it (compressed) | what `tsc` checks; regenerate whenever the layout changes |

So the expensive Lean step runs once, and every change to the TypeScript side (inlining single-use nodes, direct declaration references, global compression, project layout) is a cheap regeneration from the NDJSON. Both stages are deterministic and resumable: reruns skip modules whose output exists and is up to date.

For the RH proof (2026-11-25): 64,290 modules covering all 1,409,262 constants of the five target theorems' closure, 77 GB of NDJSON, exported in ~45 min with resumption (a restarted run skipped the 13,545 modules already done).

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
cp tools/ExportServer.lean tools/ModExport.lean ../lean4export/
git -C ../lean4export apply ../typescript-riemann-hypothesis/tools/lean4export-exportOnly.patch   # per-module export filter
printf '\n[[lean_exe]]\nname = "exportserver"\nroot = "ExportServer"\n\n[[lean_exe]]\nname = "modexport"\nroot = "ModExport"\n' >> ../lean4export/lakefile.toml
(cd ../lean4export && lake build lean4export exportserver modexport)

# 2. Mathlib's official cache, then compile the proof ourselves (Lean's kernel checks it)
(cd ../riemann-hypothesis && MATHLIB_CACHE_GET_URL=https://cache.mathlib.org/mathlib4 lake exe mathlib/cache get)  # 7.8 GB
(cd ../riemann-hypothesis && lake build Main)  # ~11.4 h, 59,828 modules, 223 GB (164 GB of it .setup.json, safe to delete)

# 3. Dependency graph of the five target theorems, ranked smallest closure first
(cd ../riemann-hypothesis && lake env lean --run ../typescript-riemann-hypothesis/tools/deps.lean \
  Main ../rh-deps.tsv $(cat export-targets.txt))                          # ~16 min, 1.41M constants, 2.6 GB
node --max-old-space-size=20000 tools/closure.mjs ../rh-deps.tsv 5000 --all > ../rh-order-all.tsv   # ~1 min

# 4a. Export the whole proof per Lean module (resumable: rerun to continue; N parallel workers),
#     then generate deterministic TypeScript per module plus manifest.json (resumable, parallel)
cut -f1 ../rh-deps.tsv > ../rh-names.txt
(cd ../riemann-hypothesis && lake env ../lean4export/.lake/build/bin/modexport Main ../rh-names.txt ../rh-ndjson 0 1 11)  # 11 threads
node tools/modts.mjs ../rh-ndjson ../rh-ts
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

**Pairwise compression: finding which modules share structure.** Compressing *pairs* of files turns a compressor into a similarity measure between them. For files x and y with compressed sizes C(x), C(y) and C(xy) (the two concatenated), the shared information is roughly C(x) + C(y) - C(xy), and the normalized compression distance

    NCD(x, y) = (C(xy) - min(C(x), C(y))) / max(C(x), C(y))

is near 0 when y adds little to x (shared structure) and near 1 when they are unrelated. Plan:

1. **Canonicalize** each module's (or project's) terms as above, so that structurally equal subterms are textually equal regardless of node ids (fingerprints to depth k).
2. **Compute pairwise NCD** with a long-window compressor (`zstd --long`, so matches across the whole pair are seen). All pairs of ~70k modules is too many, so: compute fingerprint sets per module, use MinHash/LSH to find candidate pairs with overlapping fingerprints, and only compress those pairs. Our measurement so far (0.5% gain for 3 adjacent export groups, uncanonicalized) is the baseline this must beat.
3. **Build a similarity graph** (modules as nodes, shared size as edge weight) and use it to (a) find subterm patterns shared by many modules, which become shared definitions abstracted over their differing parts, placed in a project every user can import; and (b) group modules that share a lot into the same `tsc -b` project, so the shared types are created once per program.
4. **Validate** each extraction by the two goals: total `.ts` size goes down and `tsc` check time goes down. Compression ratios only point at candidates; the kernel check time is the real measure.
