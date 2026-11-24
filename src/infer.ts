// Type inference, after nano-lean `checker/mod.rs` (`infer`, `infer_app`, `infer_proj`)
// and `checker/contextual.rs`. O = "infer only": skip checks, as Lean's `infer_only`.

import type { Nat } from "./nat";
import type { Inst, Abstract, InstLevels, HasVar, Local, Sort, Pi, Const, Proj } from "./expr";
import type { LSucc, LIMax, IsZeroLevel, LevelInScope } from "./level";
import type { Head, Args, Range } from "./util";
import type { St, DeclOf, Whnf } from "./whnf";
import type { Defeq } from "./defeq";

export type Err<Msg extends string = string, Data = unknown> = { err: Msg; data: Data };

export type Infer<S extends St, N extends Nat, E, O extends boolean> =
  E extends { e: "var" } ? Err<"unexpected bound variable", E> :
  E extends { e: "local"; t: infer T } ? T :
  E extends { e: "sort"; l: infer L } ?
    (O extends true ? Sort<LSucc<L>> :
     LevelInScope<S["us"], L> extends true ? Sort<LSucc<L>> : Err<"undeclared universe parameter", L>) :
  E extends { e: "const"; n: infer Nm; ls: infer Ls extends unknown[] } ? InferConst<S, Nm, Ls, O> :
  E extends { e: "app" } ? InferApp<S, N, Args<E>, Infer<S, N, Head<E>, O>, O> :
  E extends { e: "lam"; t: infer T; b: infer Bd } ? InferLam<S, N, T, Bd, O> :
  E extends { e: "pi"; t: infer T; b: infer Bd } ? InferPi<S, N, T, Bd, O> :
  E extends { e: "let"; t: infer T; v: infer V; b: infer Bd } ? InferLet<S, N, T, V, Bd, O> :
  E extends { e: "proj"; s: infer SN extends string; i: infer I extends number; x: infer X } ? InferProj<S, N, SN, I, X, O> :
  E extends { e: "nat" } ? LiteralType<S, "Nat"> :
  E extends { e: "str" } ? LiteralType<S, "String"> :
  Err<"malformed expression", E>;

type InferConst<S extends St, Nm, Ls extends unknown[], O extends boolean> =
  DeclOf<S, Nm> extends infer D ?
    D extends { type: infer T; lparams: infer Ps extends unknown[] } ?
      Ls["length"] extends Ps["length"] ?
        (O extends true ? InstLevels<T, Ps, Ls> :
         AllInScope<S["us"], Ls> extends true ? InstLevels<T, Ps, Ls> : Err<"undeclared universe parameter", Ls>) :
        Err<"wrong number of universe levels", Nm>
    : Err<"unknown constant", Nm>
  : never;

type AllInScope<Us extends string[], Ls> =
  Ls extends [infer L, ...infer R] ? (LevelInScope<Us, L> extends true ? AllInScope<Us, R> : false) : true;

type InferApp<S extends St, N extends Nat, As, FT, O extends boolean> =
  FT extends Err ? FT :
  As extends [infer A, ...infer R] ?
    EnsurePi<S, N, FT> extends { e: "pi"; t: infer Dom; b: infer Bd } ?
      (O extends true ? InferApp<S, N, R, Inst<Bd, A>, O> :
        Infer<S, N, A, false> extends infer AT ?
          AT extends Err ? AT :
          Defeq<S, N, AT, Dom> extends true ? InferApp<S, N, R, Inst<Bd, A>, O> :
          Err<"application type mismatch", { expected: Dom; got: AT }>
        : never)
    : Err<"function expected", FT>
  : FT;

type EnsurePi<S extends St, N extends Nat, T> = T extends { e: "pi" } ? T : Whnf<S, N, T>;

/** The level of a type's sort, or an error. */
export type SortLevel<S extends St, N extends Nat, TT> =
  TT extends Err ? TT :
  TT extends { e: "sort"; l: infer L } ? { level: L } :
  Whnf<S, N, TT> extends { e: "sort"; l: infer L } ? { level: L } :
  Err<"expected a sort", TT>;

export type CheckType<S extends St, N extends Nat, T> = SortLevel<S, N, Infer<S, N, T, false>>;

type InferLam<S extends St, N extends Nat, T, Bd, O extends boolean> =
  (O extends true ? null : CheckType<S, N, T>) extends infer R ?
    R extends Err ? R :
    Infer<S, [...N, 0], Inst<Bd, Local<N["length"], T>>, O> extends infer BT ?
      BT extends Err ? BT : Pi<T, Abstract<BT, N["length"]>>
    : never
  : never;

type InferPi<S extends St, N extends Nat, T, Bd, O extends boolean> =
  SortLevel<S, N, Infer<S, N, T, O>> extends infer R1 ?
    R1 extends Err ? R1 :
    SortLevel<S, [...N, 0], Infer<S, [...N, 0], Inst<Bd, Local<N["length"], T>>, O>> extends infer R2 ?
      R2 extends Err ? R2 :
      R1 extends { level: infer L1 } ? R2 extends { level: infer L2 } ? Sort<LIMax<L1, L2>> : never : never
    : never
  : never;

type InferLet<S extends St, N extends Nat, T, V, Bd, O extends boolean> =
  (O extends true ? null :
    CheckType<S, N, T> extends infer R ?
      R extends Err ? R :
      Infer<S, N, V, false> extends infer VT ?
        VT extends Err ? VT :
        Defeq<S, N, VT, T> extends true ? null : Err<"let value type mismatch", { expected: T; got: VT }>
      : never
    : never) extends infer C ?
    C extends Err ? C : Infer<S, N, Inst<Bd, V>, O>
  : never;

type LiteralType<S extends St, Nm extends string> =
  DeclOf<S, Nm> extends null ? Err<"literal type not declared", Nm> : Const<Nm>;

// ---------------------------------------------------------------------------
// Projections

type InferProj<S extends St, N extends Nat, SN extends string, I extends number, X, O extends boolean> =
  Infer<S, N, X, O> extends infer ST ?
    ST extends Err ? ST :
    Whnf<S, N, ST> extends infer STW ?
      Head<STW> extends { e: "const"; n: SN; ls: infer L } ?
        DeclOf<S, SN> extends { kind: "induct"; ctors: [infer C]; numIndices: 0; numParams: infer NP extends number } ?
          Args<STW> extends infer TA extends unknown[] ?
            TA["length"] extends NP ?
              DeclOf<S, C> extends { type: infer CT; lparams: infer CPs } ?
                ProjWalk<S, N, SN, X, IsProp<S, N, ST>, StripInst<InstLevels<CT, CPs, L>, TA>, Range<I>>
              : Err<"projection of a non-structure", SN>
            : Err<"projection of a non-structure", SN>
          : never
        : Err<"projection of a non-structure", SN>
      : Err<"projection type mismatch", SN>
    : never
  : never;

type StripInst<T, As> =
  As extends [infer A, ...infer R] ? (T extends { e: "pi"; b: infer Bd } ? StripInst<Inst<Bd, A>, R> : Err<"expected a Pi binder", T>) : T;

type ProjWalk<S extends St, N extends Nat, SN extends string, X, IP, R, Is> =
  R extends Err ? R :
  Whnf<S, N, R> extends { e: "pi"; t: infer Ty; b: infer Bd } ?
    Is extends [infer I extends number, ...infer Rest] ?
      HasVar<Bd> extends true ?
        (IP extends true ? (IsProp<S, N, Ty> extends true ? true : false) : true) extends true ?
          ProjWalk<S, N, SN, X, IP, Inst<Bd, Proj<SN, I, X>>, Rest>
        : Err<"invalid projection", SN>
      : ProjWalk<S, N, SN, X, IP, Bd, Rest>
    : (IP extends true ? (IsProp<S, N, Ty> extends true ? true : false) : true) extends true ? Ty : Err<"invalid projection", SN>
  : Err<"invalid projection", SN>;

// ---------------------------------------------------------------------------

/** Is T a proposition (T : Prop)? */
export type IsProp<S extends St, N extends Nat, T> =
  Infer<S, N, T, true> extends infer TT ?
    TT extends Err ? false :
    Whnf<S, N, TT> extends { e: "sort"; l: infer L } ? IsZeroLevel<L> : false
  : never;
