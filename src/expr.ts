// Expressions, following nano-lean's `term/expr.rs`:
//   - bound variables are de Bruijn indices (unary Nat tuples, we need arithmetic on them)
//   - a free variable (`local`) carries its own type, so inference needs no context
//   - substituted values are always closed (no loose bvars), so they never need lifting

import type { Nat, ToNat, Pred } from "./nat";
import type { LMap, SubstLevel } from "./level";

export type BVar<I extends Nat> = { e: "var"; i: I };
export type Local<Id extends number, T> = { e: "local"; id: Id; t: T };
export type Sort<L> = { e: "sort"; l: L };
export type Const<N extends string, Ls extends unknown[] = []> = { e: "const"; n: N; ls: Ls };
export type App<F, A> = { e: "app"; f: F; a: A };
export type Lam<T, B> = { e: "lam"; t: T; b: B };
export type Pi<T, B> = { e: "pi"; t: T; b: B };
export type Let<T, V, B> = { e: "let"; t: T; v: V; b: B };
/** Projection of field I out of X, whose type is the structure S. */
export type Proj<S extends string, I extends number, X> = { e: "proj"; s: S; i: I; x: X };
/** Nat literal, canonical decimal string. */
export type NatLit<V extends string> = { e: "nat"; v: V };
export type StrLit<V extends string> = { e: "str"; v: V };

// ---------------------------------------------------------------------------
// Authoring helpers

/** Bound variable by number literal: B<0> is the innermost binder. */
export type B<I extends number> = BVar<ToNat<I>>;

/** Multi-argument application: Ap<F, [A, B]> = App<App<F, A>, B>. */
export type Ap<F, Args extends unknown[]> =
  Args extends [infer A, ...infer R] ? Ap<App<F, A>, R> : F;

// ---------------------------------------------------------------------------
// Instantiate: replace bvar D with V (closed), decrement bvars above D.

export type Inst<E, V, D extends Nat = []> =
  E extends { e: "var"; i: infer I extends Nat } ?
    I extends D ? V :
    I extends [...D, 0, ...0[]] ? { e: "var"; i: Pred<I> } :
    E :
  E extends { e: "app"; f: infer F; a: infer A } ? { e: "app"; f: Inst<F, V, D>; a: Inst<A, V, D> } :
  E extends { e: infer K extends "lam" | "pi"; t: infer T; b: infer Bd } ?
    { e: K; t: Inst<T, V, D>; b: Inst<Bd, V, [...D, 0]> } :
  E extends { e: "let"; t: infer T; v: infer W; b: infer Bd } ?
    { e: "let"; t: Inst<T, V, D>; v: Inst<W, V, D>; b: Inst<Bd, V, [...D, 0]> } :
  E extends { e: "proj"; s: infer S; i: infer I; x: infer X } ? { e: "proj"; s: S; i: I; x: Inst<X, V, D> } :
  E;

/** Abstract: replace local Id with bvar D (the inverse of Inst). */
export type Abstract<E, Id extends number, D extends Nat = []> =
  E extends { e: "local"; id: Id } ? { e: "var"; i: D } :
  E extends { e: "app"; f: infer G; a: infer A } ? { e: "app"; f: Abstract<G, Id, D>; a: Abstract<A, Id, D> } :
  E extends { e: infer K extends "lam" | "pi"; t: infer T; b: infer Bd } ?
    { e: K; t: Abstract<T, Id, D>; b: Abstract<Bd, Id, [...D, 0]> } :
  E extends { e: "let"; t: infer T; v: infer W; b: infer Bd } ?
    { e: "let"; t: Abstract<T, Id, D>; v: Abstract<W, Id, D>; b: Abstract<Bd, Id, [...D, 0]> } :
  E extends { e: "proj"; s: infer S; i: infer I; x: infer X } ? { e: "proj"; s: S; i: I; x: Abstract<X, Id, D> } :
  E;

/** Does bvar D occur loose in E? */
export type HasVar<E, D extends Nat = []> =
  E extends { e: "var"; i: infer I extends Nat } ? (I["length"] extends D["length"] ? true : false) :
  E extends { e: "app"; f: infer F; a: infer A } ? (HasVar<F, D> extends true ? true : HasVar<A, D>) :
  E extends { e: "lam" | "pi"; t: infer T; b: infer Bd } ? (HasVar<T, D> extends true ? true : HasVar<Bd, [...D, 0]>) :
  E extends { e: "let"; t: infer T; v: infer W; b: infer Bd } ?
    (HasVar<T, D> extends true ? true : HasVar<W, D> extends true ? true : HasVar<Bd, [...D, 0]>) :
  E extends { e: "proj"; x: infer X } ? HasVar<X, D> :
  false;

// ---------------------------------------------------------------------------
// Instantiate universe level params.

export type InstLevels<E, Ps, Ls> = SubstLevels<E, LMap<Ps, Ls>>;

type SubstLevels<E, M> =
  E extends { e: "sort"; l: infer L } ? { e: "sort"; l: SubstLevel<L, M> } :
  E extends { e: "const"; n: infer N; ls: infer Ls } ?
    { e: "const"; n: N; ls: { [K in keyof Ls]: SubstLevel<Ls[K], M> } } :
  E extends { e: "app"; f: infer F; a: infer A } ? { e: "app"; f: SubstLevels<F, M>; a: SubstLevels<A, M> } :
  E extends { e: infer K extends "lam" | "pi"; t: infer T; b: infer Bd } ?
    { e: K; t: SubstLevels<T, M>; b: SubstLevels<Bd, M> } :
  E extends { e: "let"; t: infer T; v: infer W; b: infer Bd } ?
    { e: "let"; t: SubstLevels<T, M>; v: SubstLevels<W, M>; b: SubstLevels<Bd, M> } :
  E extends { e: "proj"; s: infer S; i: infer I; x: infer X } ? { e: "proj"; s: S; i: I; x: SubstLevels<X, M> } :
  E;

// ---------------------------------------------------------------------------
// Structural equality. Never use deep `[A] extends [B]` on terms: TS's
// assignability check gives up on deeply nested types and may answer "related".

export type Same<A, B> =
  A extends { e: "var"; i: infer I } ? (B extends { e: "var"; i: infer J } ? NatEq<I, J> : false) :
  A extends { e: "local"; id: infer I } ? (B extends { e: "local"; id: infer J } ? LitEq<I, J> : false) :
  A extends { e: "sort"; l: infer L1 } ? (B extends { e: "sort"; l: infer L2 } ? LvlSame<L1, L2> : false) :
  A extends { e: "const"; n: infer N1; ls: infer L1 } ?
    (B extends { e: "const"; n: infer N2; ls: infer L2 } ? (LitEq<N1, N2> extends true ? LvlsSame<L1, L2> : false) : false) :
  A extends { e: "app"; f: infer F1; a: infer A1 } ?
    (B extends { e: "app"; f: infer F2; a: infer A2 } ? (Same<F1, F2> extends true ? Same<A1, A2> : false) : false) :
  A extends { e: infer K extends "lam" | "pi"; t: infer T1; b: infer B1 } ?
    (B extends { e: K; t: infer T2; b: infer B2 } ? (Same<T1, T2> extends true ? Same<B1, B2> : false) : false) :
  A extends { e: "let"; t: infer T1; v: infer V1; b: infer B1 } ?
    (B extends { e: "let"; t: infer T2; v: infer V2; b: infer B2 } ?
      (Same<T1, T2> extends true ? (Same<V1, V2> extends true ? Same<B1, B2> : false) : false) : false) :
  A extends { e: "proj"; s: infer S1; i: infer I1; x: infer X1 } ?
    (B extends { e: "proj"; s: infer S2; i: infer I2; x: infer X2 } ?
      (LitEq<S1, S2> extends true ? (LitEq<I1, I2> extends true ? Same<X1, X2> : false) : false) : false) :
  A extends { e: infer K extends "nat" | "str"; v: infer V1 } ? (B extends { e: K; v: infer V2 } ? LitEq<V1, V2> : false) :
  false;

export type LitEq<X, Y> = [X] extends [Y] ? ([Y] extends [X] ? true : false) : false;
type NatEq<X, Y> = X extends unknown[] ? (Y extends unknown[] ? LitEq<X["length"], Y["length"]> : false) : false;

type LvlSame<A, B> =
  A extends { l: "zero" } ? (B extends { l: "zero" } ? true : false) :
  A extends { l: "param"; n: infer N } ? (B extends { l: "param"; n: infer M } ? LitEq<N, M> : false) :
  A extends { l: "succ"; a: infer X } ? (B extends { l: "succ"; a: infer Y } ? LvlSame<X, Y> : false) :
  A extends { l: infer K extends "max" | "imax"; a: infer X1; b: infer Y1 } ?
    (B extends { l: K; a: infer X2; b: infer Y2 } ? (LvlSame<X1, X2> extends true ? LvlSame<Y1, Y2> : false) : false) :
  false;

type LvlsSame<A, B> =
  A extends [infer X, ...infer R1] ? (B extends [infer Y, ...infer R2] ? (LvlSame<X, Y> extends true ? LvlsSame<R1, R2> : false) : false) :
  B extends [] ? true : false;
