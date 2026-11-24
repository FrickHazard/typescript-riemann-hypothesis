// Definitional equality, after nano-lean `checker/defeq.rs` (`def_eq_core`).

import type { Nat } from "./nat";
import type { Same, LitEq, Inst, Local, Lam, App, Proj, NatLit } from "./expr";
import type { LevelEq } from "./level";
import type { Head, Args, Drop, At, NAdd, Range } from "./util";
import type { NatCmp, NatPred } from "./natlit";
import type { St, DeclOf, WhnfCore, Whnf, Unfold, ReduceNat, StructureLike } from "./whnf";
import type { Infer, IsProp, Err } from "./infer";

export type Defeq<S extends St, N extends Nat, T, U> =
  Same<T, U> extends true ? true : DefeqCore<S, N, T, U>;

// Decisive answers for identical terms, binders, sorts and literals; null when undecided.
type Quick<S extends St, N extends Nat, T, U> =
  Same<T, U> extends true ? true :
  T extends { e: infer K extends "lam" | "pi" } ? (U extends { e: K } ? DefeqBinding<S, N, T, U> : null) :
  T extends { e: "sort"; l: infer A } ? (U extends { e: "sort"; l: infer B } ? LevelEq<A, B> : null) :
  T extends { e: infer K extends "nat" | "str"; v: infer A } ? (U extends { e: K; v: infer B } ? LitEq<A, B> : null) :
  null;

type DefeqBinding<S extends St, N extends Nat, T, U> =
  T extends { t: infer TT; b: infer TB } ? U extends { t: infer UT; b: infer UB } ?
    Defeq<S, N, TT, UT> extends true ?
      Local<N["length"], UT> extends infer L ? Defeq<S, [...N, 0], Inst<TB, L>, Inst<UB, L>> : never
    : false
  : never : never;

/** whnf_core changed E? (it is the identity on everything but app/let/proj) */
type Changed<Before, After> =
  Before extends { e: "app" | "let" | "proj" } ? (Same<Before, After> extends true ? false : true) : false;

type DefeqCore<S extends St, N extends Nat, T, U> =
  Quick<S, N, T, U> extends infer Q extends boolean ? Q :
  (T extends { e: "sort" | "pi" | "nat" | "str" } ? null : ProofIrrel<S, N, T, U>) extends infer P extends boolean ? P :
  DefeqAfterCore<S, N, T, U, WhnfCore<S, N, T>, WhnfCore<S, N, U>>;

type DefeqAfterCore<S extends St, N extends Nat, T, U, TN, UN> =
  (Changed<T, TN> extends true ? true : Changed<U, UN>) extends true ?
    (Quick<S, N, TN, UN> extends infer Q extends boolean ? Q : DefeqLazy<S, N, TN, UN>) :
  DefeqLazy<S, N, TN, UN>;

type DefeqLazy<S extends St, N extends Nat, T, U> =
  LazyDelta<S, N, T, U> extends infer R ?
    R extends boolean ? R :
    R extends [infer T2, infer U2] ? DefeqStuck<S, N, T2, U2> : never
  : never;

// Both sides are delta-stuck.
type DefeqStuck<S extends St, N extends Nat, T, U> =
  (T extends { e: "const"; n: infer A; ls: infer LA } ?
    (U extends { e: "const"; n: A; ls: infer LB } ? LevelsEq<LA, LB> : false) :
   T extends { e: "proj"; s: infer SA; i: infer IA; x: infer XA } ?
    (U extends { e: "proj"; s: SA; i: IA; x: infer XB } ? Defeq<S, N, XA, XB> : false) :
   false) extends true ? true :
  WhnfCore<S, N, T> extends infer TNN ? WhnfCore<S, N, U> extends infer UNN ?
    (Changed<T, TNN> extends true ? true : Changed<U, UNN>) extends true ? DefeqCore<S, N, TNN, UNN> :
    DefeqApp<S, N, T, U> extends true ? true :
    Eta<S, N, T, U> extends true ? true :
    Eta<S, N, U, T> extends true ? true :
    EtaStruct<S, N, T, U> extends true ? true :
    EtaStruct<S, N, U, T> extends true ? true :
    UnitLike<S, N, T, U>
  : never : never;

// ---------------------------------------------------------------------------
// Proof irrelevance

type ProofIrrel<S extends St, N extends Nat, T, U> =
  Infer<S, N, T, true> extends infer TT ?
    TT extends Err ? null :
    IsProp<S, N, TT> extends true ?
      (Infer<S, N, U, true> extends infer UT ? (UT extends Err ? false : Defeq<S, N, TT, UT>) : never) :
    null
  : never;

// ---------------------------------------------------------------------------
// Lazy delta reduction: unfold the side with the greater definitional height first.

type LazyDelta<S extends St, N extends Nat, T, U> =
  Offset<S, N, T, U> extends infer O extends boolean ? O :
  ReduceNat<S, N, T> extends infer TV ?
    [TV] extends [null] ?
      (ReduceNat<S, N, U> extends infer UV ?
        [UV] extends [null] ? LazyDeltaStep<S, N, T, U, DeltaHint<S, T>, DeltaHint<S, U>> :
        DefeqCore<S, N, T, UV>
      : never) :
    DefeqCore<S, N, TV, U>
  : never;

type LazyDeltaStep<S extends St, N extends Nat, T, U, HT, HU> =
  [HT] extends [null] ?
    ([HU] extends [null] ? [T, U] : Continue<S, N, T, UnfoldCore<S, N, U>>) :
  [HU] extends [null] ? Continue<S, N, UnfoldCore<S, N, T>, U> :
  UnfoldOrder<HT, HU> extends "lt" ? Continue<S, N, UnfoldCore<S, N, T>, U> :
  UnfoldOrder<HT, HU> extends "gt" ? Continue<S, N, T, UnfoldCore<S, N, U>> :
  // Same height: if both are applications of the same constant, try the arguments first.
  (T extends { e: "app" } ? U extends { e: "app" } ? HT extends number ?
    SameConstHead<T, U> extends true ? ArgsEq<S, N, Args<T>, Args<U>> : false
  : false : false : false) extends true ? true :
  Continue<S, N, UnfoldCore<S, N, T>, UnfoldCore<S, N, U>>;

type Continue<S extends St, N extends Nat, T, U> =
  Quick<S, N, T, U> extends infer Q extends boolean ? Q : LazyDelta<S, N, T, U>;

type UnfoldCore<S extends St, N extends Nat, E> = WhnfCore<S, N, Unfold<S, E>>;

type DeltaHint<S extends St, E> =
  Head<E> extends { e: "const"; n: infer Nm; ls: infer Ls extends unknown[] } ?
    DeclOf<S, Nm> extends infer D ?
      D extends { kind: "defn"; hint: infer H; lparams: infer Ps extends unknown[] } ?
        (Ls["length"] extends Ps["length"] ? H : null) :
      D extends { kind: "thm"; lparams: infer Ps extends unknown[] } ?
        (Ls["length"] extends Ps["length"] ? "opaque" : null) :
      null
    : never
  : null;

/** Which side to unfold: "lt" unfolds the left. Mirrors nano-lean `unfold_order`. */
type UnfoldOrder<HT, HU> =
  HT extends number ? (HU extends number ? HeightOrder<NatCmp<`${HU}`, `${HT}`>> : HU extends "opaque" ? "lt" : "gt") :
  [HT, HU] extends ["opaque", "opaque"] | ["abbrev", "abbrev"] ? "eq" :
  HT extends "opaque" ? "gt" : HU extends "abbrev" ? "gt" :
  "lt";

type HeightOrder<C> = C extends "lt" ? "lt" : C extends "gt" ? "gt" : "eq";

// Nat offsets: zero =?= zero, succ a =?= succ b (literals included).
type Offset<S extends St, N extends Nat, T, U> =
  IsNatZero<T> extends true ? (IsNatZero<U> extends true ? true : null) :
  NatPredOf<T> extends infer A ? ([A] extends [null] ? null :
    NatPredOf<U> extends infer Bp ? ([Bp] extends [null] ? null : DefeqCore<S, N, A, Bp>) : never) : never;

type IsNatZero<E> =
  E extends { e: "nat"; v: "0" } ? true : E extends { e: "const"; n: "Nat.zero" } ? true : false;

type NatPredOf<E> =
  E extends { e: "nat"; v: infer V extends string } ? (V extends "0" ? null : NatLit<NatPred<V>>) :
  E extends { e: "app"; f: { e: "const"; n: "Nat.succ" }; a: infer X } ? X :
  null;

// ---------------------------------------------------------------------------
// Applications, eta, structure eta, unit-like types

type SameConstHead<T, U> =
  Head<T> extends { e: "const"; n: infer A; ls: infer LA } ?
    (Head<U> extends { e: "const"; n: A; ls: infer LB } ? LevelsEq<LA, LB> : false) : false;

type ArgsEq<S extends St, N extends Nat, As, Bs> =
  As extends [infer A, ...infer AR] ?
    Bs extends [infer Bx, ...infer BR] ? (Defeq<S, N, A, Bx> extends true ? ArgsEq<S, N, AR, BR> : false) : false
  : Bs extends [] ? true : false;

type DefeqApp<S extends St, N extends Nat, T, U> =
  T extends { e: "app" } ? U extends { e: "app" } ?
    Args<T>["length"] extends Args<U>["length"] ?
      Defeq<S, N, Head<T>, Head<U>> extends true ? ArgsEq<S, N, Args<T>, Args<U>> : false
    : false
  : false : false;

// (λ x. b) =?= f  ~>  (λ x. b) =?= (λ x. f x)
type Eta<S extends St, N extends Nat, T, U> =
  T extends { e: "lam" } ? U extends { e: "lam" } ? false :
    Infer<S, N, U, true> extends infer UT ?
      UT extends Err ? false :
      Whnf<S, N, UT> extends { e: "pi"; t: infer Dom } ? Defeq<S, N, T, Lam<Dom, App<U, { e: "var"; i: [] }>>> : false
    : never
  : false;

// t =?= mk a1 .. an  ~>  t.i =?= ai, for structures
type EtaStruct<S extends St, N extends Nat, T, U> =
  Head<U> extends { e: "const"; n: infer C } ?
    DeclOf<S, C> extends { kind: "ctor"; induct: infer Ind extends string; numParams: infer NP extends number; numFields: infer NF extends number } ?
      Args<U>["length"] extends NAdd<NP, NF> ?
        [StructureLike<S, Ind>] extends [null] ? false :
        Infer<S, N, T, true> extends infer TT ? Infer<S, N, U, true> extends infer UT ?
          TT extends Err ? false : UT extends Err ? false :
          Defeq<S, N, TT, UT> extends true ? FieldsEq<S, N, Ind, T, Drop<Args<U>, NP>, Range<NF>> : false
        : never : never
      : false
    : false
  : false;

type FieldsEq<S extends St, N extends Nat, Ind extends string, T, Fs extends unknown[], Is> =
  Is extends [infer I extends number, ...infer R] ?
    (Defeq<S, N, Proj<Ind, I, T>, At<Fs, I>> extends true ? FieldsEq<S, N, Ind, T, Fs, R> : false)
  : true;

// Any two inhabitants of a structure with no fields are equal.
type UnitLike<S extends St, N extends Nat, T, U> =
  Infer<S, N, T, true> extends infer TT ?
    TT extends Err ? false :
    Whnf<S, N, TT> extends infer TW ?
      Head<TW> extends { e: "const"; n: infer Ind } ?
        StructureLike<S, Ind> extends { numFields: 0 } ?
          (Infer<S, N, U, true> extends infer UT ? (UT extends Err ? false : DefeqCore<S, N, TW, UT>) : never)
        : false
      : false
    : never
  : never;

type LevelsEq<L1, L2> =
  L1 extends [infer A, ...infer R1] ?
    L2 extends [infer Bx, ...infer R2] ? (LevelEq<A, Bx> extends true ? LevelsEq<R1, R2> : false) : false
  : L2 extends [] ? true : false;
