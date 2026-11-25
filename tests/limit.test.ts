// CheckDeclAt: one environment holds a whole batch; the index limit must hide the
// declaration being checked and everything after it.
import type { Sort, Const, Pi, B } from "../src/expr";
import type { LZero } from "../src/level";
import type { Axiom, Thm, Defn } from "../src/decl";
import type { CheckDeclAt, Idx } from "../src/check";
import type { Expect, Equal } from "./util";

type Prop = Sort<LZero>;
type P = Axiom<"P", [], Prop>;
// t : P := t   (circular: must not be accepted)
type T = Thm<"t", [], Const<"P">, Const<"t">>;
// u : P := later   (forward reference to a later declaration)
type U = Thm<"u", [], Const<"P">, Const<"later">>;
type Later = Axiom<"later", [], Const<"P">>;
type Env = { P: Idx<P, 0>; t: Idx<T, 1>; u: Idx<U, 2>; later: Idx<Later, 3> };

type IsErr<R, M extends string> = R extends { err: M } ? true : false;
// Definitions may refer to earlier entries fine.
type Id = Defn<"id2", [], Pi<Prop, Prop>, Const<"P">>;

export type Tests = [
  Expect<Equal<CheckDeclAt<Env, P, 0>, true>>,
  Expect<IsErr<CheckDeclAt<Env, T, 1>, "unknown constant">>,      // self-reference
  Expect<IsErr<CheckDeclAt<Env, U, 2>, "unknown constant">>,      // forward reference
  Expect<Equal<CheckDeclAt<Env, Later, 3>, true>>,
  Expect<IsErr<CheckDeclAt<Env, Thm<"v", [], Const<"P">, Const<"later">>, 4>, "declaration type mismatch"> extends true ? false : true>,
];
