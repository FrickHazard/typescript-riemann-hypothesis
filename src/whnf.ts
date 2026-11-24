// Weak head normalization, after nano-lean `checker/whnf.rs`.
//
// Every kernel function takes:
//   S : { env; us }  environment and the universe params in scope
//   N : Nat tuple    fresh-local counter; every local in hand has id < N["length"]

import type { Nat } from "./nat";
import type { Inst, InstLevels, Same, Const, App, NatLit, Proj } from "./expr";
import type { Head, Args, MkApps, Take, Drop, At, NAdd, TakeLast, Range } from "./util";
import type { NatAdd, NatSub, NatMul, NatDiv, NatMod, NatPow, NatGcd, NatCmp, NatSucc, NatPred } from "./natlit";
import type { Infer, IsProp } from "./infer";
import type { Defeq } from "./defeq";

export type St = { env: any; us: string[] };

export type DeclOf<S extends St, Name> = Name extends keyof S["env"] ? S["env"][Name] : null;

// ---------------------------------------------------------------------------
// whnf_core: beta, zeta, iota (recursors, quotients), projections. No delta.

export type WhnfCore<S extends St, N extends Nat, E> =
  E extends { e: "app" } ? WhnfCoreApp<S, N, E, Head<E>, Args<E>> :
  E extends { e: "let"; v: infer V; b: infer Bd } ? WhnfCore<S, N, Inst<Bd, V>> :
  E extends { e: "proj"; i: infer I extends number; x: infer X } ?
    (ReduceProj<S, N, I, X> extends infer R ? ([R] extends [null] ? E : WhnfCore<S, N, R>) : never) :
  E;

type WhnfCoreApp<S extends St, N extends Nat, E, F0, As extends unknown[]> =
  WhnfCore<S, N, F0> extends infer F ?
    F extends { e: "lam" } ? WhnfCore<S, N, Beta<F, As>> :
    Same<F, F0> extends true ?
      (ReduceRec<S, N, F, As> extends infer R ? ([R] extends [null] ? E : WhnfCore<S, N, R>) : never) :
    WhnfCore<S, N, MkApps<F, As>>
  : never;

/** Apply a lambda to as many arguments as it has binders. */
type Beta<F, As extends unknown[]> =
  F extends { e: "lam"; b: infer Bd } ?
    As extends [infer A, ...infer R] ? Beta<Inst<Bd, A>, R> : F
  : MkApps<F, As>;

// ---------------------------------------------------------------------------
// whnf: whnf_core, then Nat literal folding, then delta, until stuck.

export type Whnf<S extends St, N extends Nat, E> =
  E extends { e: "sort" | "pi" | "lam" | "nat" | "str" | "local" } ? E :
  WhnfCore<S, N, E> extends infer T1 ?
    ReduceNat<S, N, T1> extends infer V ?
      [V] extends [null] ?
        (Unfold<S, T1> extends infer U ? ([U] extends [null] ? T1 : Whnf<S, N, U>) : never) :
      V
    : never
  : never;

/** Delta: unfold the head constant (definitions and theorems, not opaques). */
export type Unfold<S extends St, E> =
  Head<E> extends { e: "const"; n: infer Nm; ls: infer Ls extends unknown[] } ?
    DeclOf<S, Nm> extends infer D ?
      D extends { kind: "defn" | "thm"; value: infer V; lparams: infer Ps extends unknown[] } ?
        Ls["length"] extends Ps["length"] ? MkApps<InstLevels<V, Ps, Ls>, Args<E>> : null
      : null
    : never
  : null;

// ---------------------------------------------------------------------------
// Projections

type ReduceProj<S extends St, N extends Nat, I extends number, X> =
  Whnf<S, N, X> extends infer C ?
    Head<C> extends { e: "const"; n: infer Nm } ?
      DeclOf<S, Nm> extends { kind: "ctor"; numParams: infer NP extends number } ?
        At<Args<C>, NAdd<NP, I>>
      : null
    : null
  : never;

// ---------------------------------------------------------------------------
// Recursors (iota) and quotients

type ReduceRec<S extends St, N extends Nat, F, As extends unknown[]> =
  F extends { e: "const"; n: infer Nm; ls: infer Ls extends unknown[] } ?
    DeclOf<S, Nm> extends infer D ?
      D extends { kind: "quot" } ?
        (Nm extends "Quot.lift" ? ReduceQuot<S, N, As, 5> : Nm extends "Quot.ind" ? ReduceQuot<S, N, As, 4> : null) :
      D extends { kind: "rec" } ? ReduceIndRec<S, N, D, Ls, As> :
      null
    : never
  : null;

// Quot.lift f h (Quot.mk r a) ~> f a ; Quot.ind likewise. The function is argument 3.
type ReduceQuot<S extends St, N extends Nat, As extends unknown[], Mk extends number> =
  At<As, Mk> extends infer Major ?
    [Major] extends [null] ? null :
    Whnf<S, N, Major> extends infer M ?
      M extends { e: "app"; a: infer A } ?
        Head<M> extends { e: "const"; n: "Quot.mk" } ?
          Args<M>["length"] extends 3 ? MkApps<App<As[3], A>, Drop<As, NAdd<Mk, 1>>> : null
        : null
      : null
    : never
  : never;

type MajorIdx<R> =
  R extends { numParams: infer A extends number; numMotives: infer B extends number; numMinors: infer C extends number; numIndices: infer D extends number } ?
    NAdd<NAdd<A, B>, NAdd<C, D>> : never;

type ReduceIndRec<S extends St, N extends Nat, R, Ls extends unknown[], As extends unknown[]> =
  MajorIdx<R> extends infer MI extends number ?
    At<As, MI> extends infer Major0 ?
      [Major0] extends [null] ? null :
      (R extends { k: true } ? ExposeK<S, N, R, Major0> : Major0) extends infer Major1 ?
        Whnf<S, N, Major1> extends infer Major2 ?
          (Major2 extends { e: "nat"; v: infer V extends string } ? NatToCtor<V> :
            RecInduct<S, R> extends infer Ind extends string ? ExposeStruct<S, N, Ind, Major2> : Major2
          ) extends infer Major ?
            ApplyRule<R, Ls, As, MI, Major>
          : never
        : never
      : never
    : never
  : never;

type ApplyRule<R, Ls extends unknown[], As extends unknown[], MI extends number, Major> =
  Head<Major> extends { e: "const"; n: infer CName } ?
    R extends { rules: infer Rules; lparams: infer Ps extends unknown[]; numParams: infer NP extends number;
                numMotives: infer NM extends number; numMinors: infer NMin extends number } ?
      FindRule<Rules, CName> extends { nfields: infer NF extends number; rhs: infer Rhs } ?
        Args<Major> extends infer MA extends unknown[] ?
          Take<MA, NF>["length"] extends NF ? // margs.len() >= nfields (Take saturates)
            Ls["length"] extends Ps["length"] ?
              MkApps<MkApps<MkApps<InstLevels<Rhs, Ps, Ls>, Take<As, NAdd<NAdd<NP, NM>, NMin>>>, TakeLast<MA, NF>>, Drop<As, NAdd<MI, 1>>>
            : null
          : null
        : never
      : null
    : never
  : null;

type FindRule<Rules, C> =
  Rules extends [infer R, ...infer Rest] ? (R extends { ctor: C } ? R : FindRule<Rest, C>) : null;

/** The inductive type a recursor eliminates (via its first rule's constructor). */
type RecInduct<S extends St, R> =
  R extends { rules: [{ ctor: infer C }, ...unknown[]] } ?
    DeclOf<S, C> extends { kind: "ctor"; induct: infer I } ? I : null
  : null;

// K-like recursors (e.g. Eq.rec): replace the major premise by the constructor
// if their types agree, so reduction does not need the major to be a constructor.
type ExposeK<S extends St, N extends Nat, R, E> =
  RecInduct<S, R> extends infer Ind extends string ?
    Whnf<S, N, Infer<S, N, E, true>> extends infer T ?
      Head<T> extends { e: "const"; n: Ind; ls: infer L extends unknown[] } ?
        R extends { numParams: infer NP extends number; rules: [{ ctor: infer C extends string }, ...unknown[]] } ?
          MkApps<Const<C, L>, Take<Args<T>, NP>> extends infer NC ?
            Infer<S, N, NC, true> extends infer NT ?
              Defeq<S, N, T, NT> extends true ? NC : E
            : never
          : never
        : E
      : E
    : never
  : E;

/** Structure-like: one constructor, no indices, not recursive. Returns the constructor decl. */
export type StructureLike<S extends St, Ind> =
  DeclOf<S, Ind> extends { kind: "induct"; ctors: [infer C]; numIndices: 0; isRec: false } ?
    DeclOf<S, C> : null;

// Eta for structures: x ~> mk (x.1) ... (x.n), so recursors on structures reduce.
export type ExposeStruct<S extends St, N extends Nat, Ind extends string, E> =
  StructureLike<S, Ind> extends { name: infer CN extends string; numParams: infer NP extends number; numFields: infer NF extends number } ?
    (Head<E> extends { e: "const"; n: infer H } ? (DeclOf<S, H> extends { kind: "ctor" } ? true : false) : false) extends true ? E :
    Whnf<S, N, Infer<S, N, E, true>> extends infer T ?
      Head<T> extends { e: "const"; n: Ind; ls: infer L extends unknown[] } ?
        IsProp<S, N, T> extends true ? E :
        MkApps<MkApps<Const<CN, L>, Take<Args<T>, NP>>, Fields<Ind, E, Range<NF>>>
      : E
    : never
  : E;

type Fields<Ind extends string, E, Is extends number[]> = { [K in keyof Is]: Proj<Ind, Is[K], E> };

// ---------------------------------------------------------------------------
// Nat literal extension (trusted by name, as in Lean's kernel)

export type NatToCtor<V extends string> =
  V extends "0" ? Const<"Nat.zero"> : App<Const<"Nat.succ">, NatLit<NatPred<V>>>;

type NatVal<S extends St, N extends Nat, E> =
  Whnf<S, N, E> extends infer W ?
    W extends { e: "nat"; v: infer V } ? V :
    W extends { e: "const"; n: "Nat.zero" } ? "0" :
    null
  : never;

type BoolC<B extends boolean> = B extends true ? Const<"Bool.true"> : Const<"Bool.false">;

type BinOp<Op, X extends string, Y extends string> =
  Op extends "Nat.add" ? NatLit<NatAdd<X, Y>> :
  Op extends "Nat.sub" ? NatLit<NatSub<X, Y>> :
  Op extends "Nat.mul" ? NatLit<NatMul<X, Y>> :
  Op extends "Nat.div" ? NatLit<NatDiv<X, Y>> :
  Op extends "Nat.mod" ? NatLit<NatMod<X, Y>> :
  Op extends "Nat.pow" ? NatLit<NatPow<X, Y>> :
  Op extends "Nat.gcd" ? NatLit<NatGcd<X, Y>> :
  Op extends "Nat.beq" ? BoolC<NatCmp<X, Y> extends "eq" ? true : false> :
  Op extends "Nat.ble" ? BoolC<NatCmp<X, Y> extends "gt" ? false : true> :
  null; // land/lor/xor/shiftLeft/shiftRight/log2: not accelerated yet, fall back to delta

type BinOps = "Nat.add" | "Nat.sub" | "Nat.mul" | "Nat.div" | "Nat.mod" | "Nat.pow" | "Nat.gcd" | "Nat.beq" | "Nat.ble";

export type ReduceNat<S extends St, N extends Nat, E> =
  E extends { e: "app"; f: infer F; a: infer Y } ?
    Head<E> extends { e: "const"; n: infer Op } ?
      Args<E>["length"] extends 1 ?
        (Op extends "Nat.succ" ? (NatVal<S, N, Y> extends infer V extends string ? NatLit<NatSucc<V>> : null) : null) :
      Args<E>["length"] extends 2 ?
        (Op extends BinOps ?
          F extends { e: "app"; a: infer X } ?
            NatVal<S, N, X> extends infer VX extends string ?
              NatVal<S, N, Y> extends infer VY extends string ? BinOp<Op, VX, VY> : null
            : null
          : null
        : null) :
      null
    : null
  : null;
