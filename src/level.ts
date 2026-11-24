// Universe levels and a complete decision procedure for level (in)equality.
//
// Algorithm for `A <= B` (for all assignments of the level params):
//   1. Simplify both sides so `imax` only appears as `imax(x, param)`.
//   2. If some `imax(x, p)` remains, case-split on p = 0 and p = succ p
//      (re-using the name is sound: p ranges over all naturals). Both must hold.
//   3. Without imax, each side is a max of terms `p + k` or constants `k`.
//      `A <= B` iff every term of A is covered by a term of B:
//        - `p + k` needs some `p + j` in B with j >= k
//        - constant `k` needs any term in B with offset >= k

import type { Nat, Geq } from "./nat";

export type LZero = { l: "zero" };
export type LSucc<A> = { l: "succ"; a: A };
export type LMax<A, B> = { l: "max"; a: A; b: B };
export type LIMax<A, B> = { l: "imax"; a: A; b: B };
export type LParam<N extends string> = { l: "param"; n: N };

export type Level =
  | LZero
  | { l: "succ"; a: Level }
  | { l: "max"; a: Level; b: Level }
  | { l: "imax"; a: Level; b: Level }
  | { l: "param"; n: string };

/** Numeric level literal: L<2> = succ (succ zero). */
export type LNum<N extends number, Acc extends Nat = [], R = LZero> =
  Acc["length"] extends N ? R : LNum<N, [...Acc, 0], LSucc<R>>;

// ---------------------------------------------------------------------------
// Simplification

type Simp<L> =
  L extends { l: "succ"; a: infer A } ? { l: "succ"; a: Simp<A> } :
  L extends { l: "max"; a: infer A; b: infer B } ? { l: "max"; a: Simp<A>; b: Simp<B> } :
  L extends { l: "imax"; a: infer A; b: infer B } ? SimpIMax<Simp<A>, Simp<B>> :
  L;

// A, B already simplified.
type SimpIMax<A, B> =
  B extends { l: "zero" } ? B :
  B extends { l: "succ" } ? { l: "max"; a: A; b: B } :
  B extends { l: "max"; a: infer C; b: infer D } ? { l: "max"; a: SimpIMax<A, C>; b: SimpIMax<A, D> } :
  // B = imax(C, p) with p a param: imax(A, imax(C, p)) = imax(max(A, C), p)
  B extends { l: "imax"; a: infer C; b: infer D } ? { l: "imax"; a: { l: "max"; a: A; b: C }; b: D } :
  { l: "imax"; a: A; b: B };

// ---------------------------------------------------------------------------
// Case splitting on params under imax

type FindIMax<L> =
  L extends { l: "imax"; b: { n: infer P } } ? P :
  L extends { l: "succ"; a: infer A } ? FindIMax<A> :
  L extends { l: "max"; a: infer A; b: infer B } ? Or<FindIMax<A>, FindIMax<B>> :
  never;

type Or<X, Y> = [X] extends [never] ? Y : X;

type SubstParam<L, P, V> =
  L extends { l: "param"; n: P } ? V :
  L extends { l: "succ"; a: infer A } ? { l: "succ"; a: SubstParam<A, P, V> } :
  L extends { l: infer T extends "max" | "imax"; a: infer A; b: infer B } ?
    { l: T; a: SubstParam<A, P, V>; b: SubstParam<B, P, V> } :
  L;

// ---------------------------------------------------------------------------
// imax-free comparison

type Terms<L, K extends Nat = []> =
  L extends { l: "zero" } ? [["", K]] :
  L extends { l: "param"; n: infer P } ? [[P, K]] :
  L extends { l: "succ"; a: infer A } ? Terms<A, [...K, 0]> :
  L extends { l: "max"; a: infer A; b: infer B } ? [...Terms<A, K>, ...Terms<B, K>] :
  never;

type Covers<T, B> =
  T extends ["", infer K extends Nat] ? (B extends [any, infer J extends Nat] ? Geq<J, K> : false) :
  T extends [infer P, infer K extends Nat] ? (B extends [P, infer J extends Nat] ? Geq<J, K> : false) :
  false;

type Covered<T, Bs> =
  T extends ["", []] ? true :
  Bs extends [infer B, ...infer Rest] ? (Covers<T, B> extends true ? true : Covered<T, Rest>) :
  false;

type AllCovered<As, Bs> =
  As extends [infer T, ...infer Rest] ? (Covered<T, Bs> extends true ? AllCovered<Rest, Bs> : false) :
  true;

// ---------------------------------------------------------------------------

// A, B simplified.
type LeqS<A, B> =
  Or<FindIMax<A>, FindIMax<B>> extends infer P ?
    [P] extends [never] ? AllCovered<Terms<A>, Terms<B>> :
    LeqS<Simp<SubstParam<A, P, LZero>>, Simp<SubstParam<B, P, LZero>>> extends true ?
      LeqS<Simp<SubstParam<A, P, LSucc<LParam<P & string>>>>, Simp<SubstParam<B, P, LSucc<LParam<P & string>>>>> :
      false
  : never;

export type LevelLeq<A, B> = LeqS<Simp<A>, Simp<B>>;

export type LevelEq<A, B> =
  LevelLeq<A, B> extends true ? LevelLeq<B, A> : false;

export type IsZeroLevel<L> = LevelLeq<L, LZero>;

// ---------------------------------------------------------------------------
// Level parameter substitution and scope checking

/** Build {name: level} from parallel tuples. */
export type LMap<Ps, Ls, M = {}> =
  Ps extends [infer P extends string, ...infer PR] ?
    Ls extends [infer L, ...infer LR] ? LMap<PR, LR, M & { [K in P]: L }> : M
  : M;

export type SubstLevel<L, M> =
  L extends { l: "param"; n: infer N } ? (N extends keyof M ? M[N] : L) :
  L extends { l: "succ"; a: infer A } ? { l: "succ"; a: SubstLevel<A, M> } :
  L extends { l: infer T extends "max" | "imax"; a: infer A; b: infer B } ?
    { l: T; a: SubstLevel<A, M>; b: SubstLevel<B, M> } :
  L;

/** Every param in L appears in Us. */
export type LevelInScope<Us extends string[], L> =
  L extends { l: "param"; n: infer N } ? (N extends Us[number] ? true : false) :
  L extends { l: "succ"; a: infer A } ? LevelInScope<Us, A> :
  L extends { l: "max" | "imax"; a: infer A; b: infer B } ?
    (LevelInScope<Us, A> extends true ? LevelInScope<Us, B> : false) :
  true;
