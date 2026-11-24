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
A repo that implements WASM in Typescript Types: https://github.com/MichiganTypeScript/typescript-types-only-wasm-runtime
List and benchmark for LEAN kernels: https://github.com/leanprover/lean-kernel-arena
The community REPO with clean up for LEAN proof: https://github.com/leanprover-community/riemann-hypothesis/tree/main
LEAN MathLib : https://github.com/leanprover-community/mathlib4
