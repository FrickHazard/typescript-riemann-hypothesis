// Declaration checking, after nano-lean `checker/mod.rs` (`check_in`).
//
// NOT YET SOUND for inductive blocks: Induct/Ctor/Rec declarations are only checked
// to have well-formed types; their recursor rules are trusted as given. Validating
// a block (positivity, universe constraints, regenerating the recursor and comparing,
// as in nano-lean `checker/native_inductive.rs`) is the next step. Quot declarations
// are likewise not yet compared against their expected shapes (`checker/quot.rs`).

import type { Decl } from "./decl";
import type { Err, Infer, CheckType, IsProp } from "./infer";
import type { Defeq } from "./defeq";

type Distinct<Ps> =
  Ps extends [infer P, ...infer R] ? (P extends R[number] ? false : Distinct<R>) : true;

export type CheckDecl<Env, D extends Decl> =
  D["name"] extends keyof Env ? Err<"already declared", D["name"]> :
  Distinct<D["lparams"]> extends false ? Err<"duplicate universe parameter", D["lparams"]> :
  { env: Env; us: D["lparams"] } extends infer S extends { env: Env; us: string[] } ?
    CheckType<S, [], D["type"]> extends infer R ?
      R extends Err ? R :
      D extends { kind: "axiom" | "quot" | "induct" | "ctor" | "rec" } ? true :
      D extends { kind: "defn" | "opaque"; value: infer V } ? CheckValue<S, V, D["type"]> :
      D extends { kind: "thm"; value: infer V } ?
        (IsProp<S, [], D["type"]> extends true ? CheckValue<S, V, D["type"]> :
          Err<"theorem type is not a proposition", D["name"]>) :
      Err<"unknown declaration kind", D["kind"]>
    : never
  : never;

type CheckValue<S extends { env: any; us: string[] }, V, T> =
  Infer<S, [], V, false> extends infer VT ?
    VT extends Err ? VT :
    Defeq<S, [], VT, T> extends true ? true :
    Err<"declaration type mismatch", { expected: T; got: VT }>
  : never;

/** Check declarations in order; each may only refer to earlier ones. */
export type CheckEnv<Ds extends Decl[], Env = {}> =
  Ds extends [infer D extends Decl, ...infer Rest extends Decl[]] ?
    CheckDecl<Env, D> extends infer R ?
      R extends true ? CheckEnv<Rest, Env & { [K in D["name"]]: D }> :
      { failedAt: D["name"]; error: R }
    : never
  : true;

/** The environment built from already-checked declarations (for tests / reuse). */
export type EnvOf<Ds extends Decl[], Env = {}> =
  Ds extends [infer D extends Decl, ...infer Rest extends Decl[]] ? EnvOf<Rest, Env & { [K in D["name"]]: D }> : Env;

/** Assert a declaration checked: `Verified<CheckDecl<Env, D>>` errors with the kernel's message otherwise. */
export type Verified<R extends true> = R;
