// Inductive types, recursors (iota), Nat literals, K-like reduction, structures.
// Declarations are written the way Lean exports them (cf. lean4export / nano-lean).

import type { Sort, Const, Lam, Pi, B, Ap, App, Proj, NatLit } from "../src/expr";
import type { LZero, LParam, LNum } from "../src/level";
import type { Axiom, Defn, Thm, Induct, Ctor, Rec, RecRule, Decl } from "../src/decl";
import type { CheckEnv } from "../src/check";
import type { Expect, Equal, Fails } from "./util";

type u = LParam<"u">;
type v = LParam<"v">;
type Prop = Sort<LZero>;
type Type = Sort<LNum<1>>;
type L1 = LNum<1>;
type n<V extends string> = NatLit<V>;

// --- Nat ---------------------------------------------------------------------
type Nat = Const<"Nat">;
type Zero = Const<"Nat.zero">;
type Succ = Const<"Nat.succ">;
type NatMotive = Pi<Nat, Sort<u>>;
// (n : Nat) → motive n → motive (succ n), under binders [motive, zero]
type NatSuccMinor = Pi<Nat, Pi<App<B<2>, B<0>>, App<B<3>, App<Succ, B<1>>>>>;

type NatDecls = [
  Induct<"Nat", [], Type, { numParams: 0; numIndices: 0; ctors: ["Nat.zero", "Nat.succ"]; isRec: true }>,
  Ctor<"Nat.zero", [], Nat, { induct: "Nat"; cidx: 0; numParams: 0; numFields: 0 }>,
  Ctor<"Nat.succ", [], Pi<Nat, Nat>, { induct: "Nat"; cidx: 1; numParams: 0; numFields: 1 }>,
  // Nat.rec.{u} : {motive : Nat → Sort u} → motive zero → ((n : Nat) → motive n → motive (n+1)) → (t : Nat) → motive t
  Rec<"Nat.rec", ["u"],
    Pi<NatMotive, Pi<App<B<0>, Zero>, Pi<NatSuccMinor, Pi<Nat, App<B<3>, B<0>>>>>>,
    { numParams: 0; numIndices: 0; numMotives: 1; numMinors: 2; k: false; rules: [
      RecRule<"Nat.zero", 0, Lam<NatMotive, Lam<App<B<0>, Zero>, Lam<NatSuccMinor, B<1>>>>>,
      RecRule<"Nat.succ", 1, Lam<NatMotive, Lam<App<B<0>, Zero>, Lam<NatSuccMinor, Lam<Nat,
        Ap<B<1>, [B<0>, Ap<Const<"Nat.rec", [u]>, [B<3>, B<2>, B<1>, B<0>]>]>>>>>>,
    ] }>,
];

// add m n := Nat.rec (motive := fun _ => Nat) m (fun _ ih => succ ih) n
type AddBody = Lam<Nat, Lam<Nat, Ap<Const<"Nat.rec", [L1]>, [Lam<Nat, Nat>, B<1>, Lam<Nat, Lam<Nat, App<Succ, B<0>>>>, B<0>]>>>;

// --- Bool --------------------------------------------------------------------
type BoolDecls = [
  Induct<"Bool", [], Type, { numParams: 0; numIndices: 0; ctors: ["Bool.false", "Bool.true"]; isRec: false }>,
  Ctor<"Bool.false", [], Const<"Bool">, { induct: "Bool"; cidx: 0; numParams: 0; numFields: 0 }>,
  Ctor<"Bool.true", [], Const<"Bool">, { induct: "Bool"; cidx: 1; numParams: 0; numFields: 0 }>,
];

// --- Eq (inductive, K-like recursor) -------------------------------------------
type EqC<L, T, X, Y> = Ap<Const<"Eq", [L]>, [T, X, Y]>;
// motive : (b : α) → a = b → Sort u, under [α, a]
type EqMotive = Pi<B<1>, Pi<EqC<v, B<2>, B<1>, B<0>>, Sort<u>>>;
// refl : motive a (Eq.refl a), under [α, a, motive]
type EqReflMinor = Ap<B<0>, [B<1>, Ap<Const<"Eq.refl", [v]>, [B<2>, B<1>]>]>;
type EqDecls = [
  Induct<"Eq", ["u"], Pi<Sort<u>, Pi<B<0>, Pi<B<1>, Prop>>>,
    { numParams: 2; numIndices: 1; ctors: ["Eq.refl"]; isRec: false }>,
  Ctor<"Eq.refl", ["u"], Pi<Sort<u>, Pi<B<0>, EqC<u, B<1>, B<0>, B<0>>>>,
    { induct: "Eq"; cidx: 0; numParams: 2; numFields: 0 }>,
  // Eq.rec.{u, v} : {α : Sort v} → {a : α} → {motive} → motive a rfl → {b : α} → (t : a = b) → motive b t
  Rec<"Eq.rec", ["u", "v"],
    Pi<Sort<v>, Pi<B<0>, Pi<EqMotive, Pi<EqReflMinor, Pi<B<3>, Pi<EqC<v, B<4>, B<3>, B<0>>, Ap<B<3>, [B<1>, B<0>]>>>>>>>,
    { numParams: 2; numIndices: 1; numMotives: 1; numMinors: 1; k: true; rules: [
      RecRule<"Eq.refl", 0, Lam<Sort<v>, Lam<B<0>, Lam<EqMotive, Lam<EqReflMinor, B<0>>>>>>,
    ] }>,
];
type Refl<L, T, X> = Ap<Const<"Eq.refl", [L]>, [T, X]>;
type EqNat<X, Y> = EqC<L1, Nat, X, Y>;
type ReflNat<X> = Refl<L1, Nat, X>;

// --- A structure: Pair := mk (fst snd : Nat) -------------------------------------
type Pair = Const<"Pair">;
type Mk = Const<"Pair.mk">;
type PairMotive = Pi<Pair, Sort<u>>;
type PairMinor = Pi<Nat, Pi<Nat, App<B<2>, Ap<Mk, [B<1>, B<0>]>>>>;
type PairDecls = [
  Induct<"Pair", [], Type, { numParams: 0; numIndices: 0; ctors: ["Pair.mk"]; isRec: false }>,
  Ctor<"Pair.mk", [], Pi<Nat, Pi<Nat, Pair>>, { induct: "Pair"; cidx: 0; numParams: 0; numFields: 2 }>,
  Rec<"Pair.rec", ["u"], Pi<PairMotive, Pi<PairMinor, Pi<Pair, App<B<2>, B<0>>>>>,
    { numParams: 0; numIndices: 0; numMotives: 1; numMinors: 1; k: false; rules: [
      RecRule<"Pair.mk", 2, Lam<PairMotive, Lam<PairMinor, Lam<Nat, Lam<Nat, Ap<B<2>, [B<1>, B<0>]>>>>>>,
    ] }>,
];

// --- A unit-like structure ------------------------------------------------------
type UnitDecls = [
  Induct<"U", [], Type, { numParams: 0; numIndices: 0; ctors: ["U.star"]; isRec: false }>,
  Ctor<"U.star", [], Const<"U">, { induct: "U"; cidx: 0; numParams: 0; numFields: 0 }>,
];

type Prelude = [...NatDecls, ...BoolDecls, ...EqDecls, ...PairDecls, ...UnitDecls,
  Defn<"Nat.add", [], Pi<Nat, Pi<Nat, Nat>>, AddBody, 1>,
  Defn<"myadd", [], Pi<Nat, Pi<Nat, Nat>>, AddBody, 1>,   // same body, not accelerated
  Axiom<"Nat.mul", [], Pi<Nat, Pi<Nat, Nat>>>,             // body irrelevant: literals fold by name
  Axiom<"Nat.beq", [], Pi<Nat, Pi<Nat, Const<"Bool">>>>,
];
type Ok<Ds extends Decl[]> = Equal<CheckEnv<[...Prelude, ...Ds]>, true>;
type Bad<Ds extends Decl[], M extends string> = Fails<CheckEnv<[...Prelude, ...Ds]>, M>;

type Add<X, Y> = Ap<Const<"Nat.add">, [X, Y]>;
type MyAdd<X, Y> = Ap<Const<"myadd">, [X, Y]>;

export type Tests = [
  Expect<Equal<CheckEnv<Prelude>, true>>,

  // Nat literals: accelerated arithmetic and literal typing
  Expect<Ok<[Thm<"t", [], EqNat<Add<n<"2">, n<"2">>, n<"4">>, ReflNat<n<"4">>>]>>,
  Expect<Ok<[Thm<"t", [], EqNat<Ap<Const<"Nat.mul">, [n<"123456789">, n<"987654321">]>, n<"121932631112635269">>, ReflNat<n<"121932631112635269">>>]>>,
  Expect<Ok<[Thm<"t", [], EqC<L1, Const<"Bool">, Ap<Const<"Nat.beq">, [n<"3">, n<"3">]>, Const<"Bool.true">>, Refl<L1, Const<"Bool">, Const<"Bool.true">>>]>>,
  Expect<Bad<[Thm<"t", [], EqNat<Add<n<"2">, n<"2">>, n<"5">>, ReflNat<n<"5">>>], "declaration type mismatch">>,

  // iota: the same addition by recursion, majors given as literals (literal -> succ conversion)
  Expect<Ok<[Thm<"t", [], EqNat<MyAdd<n<"2">, n<"2">>, n<"4">>, ReflNat<n<"4">>>]>>,
  Expect<Ok<[Thm<"t", [], EqNat<MyAdd<n<"2">, n<"1">>, App<Succ, App<Succ, App<Succ, Zero>>>>, ReflNat<n<"3">>>]>>,
  Expect<Bad<[Thm<"t", [], EqNat<MyAdd<n<"2">, n<"2">>, n<"3">>, ReflNat<n<"3">>>], "declaration type mismatch">>,
  // definitional unfolding vs. literal folding agree
  Expect<Ok<[Thm<"t", [], EqNat<MyAdd<n<"3">, n<"4">>, Add<n<"3">, n<"4">>>, ReflNat<n<"7">>>]>>,

  // K-like reduction: Eq.rec reduces on a *hypothesis* h : 2 = 2, not just on Eq.refl
  Expect<Ok<[Axiom<"h", [], EqNat<n<"2">, n<"2">>>,
    Thm<"t", [], EqNat<Ap<Const<"Eq.rec", [L1, L1]>, [Nat, n<"2">, Lam<Nat, Lam<EqNat<n<"2">, B<0>>, Nat>>, n<"5">, n<"2">, Const<"h">]>, n<"5">>,
      ReflNat<n<"5">>>]>>,
  // ...but not on h : 2 = 3 (the indices differ, so it is not definitionally Eq.refl)
  Expect<Bad<[Axiom<"h", [], EqNat<n<"2">, n<"3">>>,
    Thm<"t", [], EqNat<Ap<Const<"Eq.rec", [L1, L1]>, [Nat, n<"2">, Lam<Nat, Lam<EqNat<n<"2">, B<0>>, Nat>>, n<"5">, n<"3">, Const<"h">]>, n<"5">>,
      ReflNat<n<"5">>>], "declaration type mismatch">>,

  // structures: projection typing and reduction
  Expect<Ok<[Defn<"fst", [], Pi<Pair, Nat>, Lam<Pair, Proj<"Pair", 0, B<0>>>>,
    Thm<"t", [], EqNat<Proj<"Pair", 1, Ap<Mk, [n<"1">, n<"2">]>>, n<"2">>, ReflNat<n<"2">>>]>>,
  Expect<Bad<[Thm<"t", [], EqNat<Proj<"Pair", 1, Ap<Mk, [n<"1">, n<"2">]>>, n<"1">>, ReflNat<n<"1">>>], "declaration type mismatch">>,
  Expect<Bad<[Defn<"x", [], Nat, Proj<"Nat", 0, n<"1">>>], "projection of a non-structure">>,
  // structure eta: mk p.1 p.2 = p
  Expect<Ok<[Axiom<"p", [], Pair>,
    Thm<"t", [], EqC<L1, Pair, Ap<Mk, [Proj<"Pair", 0, Const<"p">>, Proj<"Pair", 1, Const<"p">>]>, Const<"p">>, Refl<L1, Pair, Const<"p">>>]>>,
  Expect<Bad<[Axiom<"p", [], Pair>,
    Thm<"t", [], EqC<L1, Pair, Ap<Mk, [Proj<"Pair", 1, Const<"p">>, Proj<"Pair", 0, Const<"p">>]>, Const<"p">>, Refl<L1, Pair, Const<"p">>>], "declaration type mismatch">>,
  // a recursor on a structure reduces even on a non-constructor (via eta): Pair.rec (fun a _ => a) p = p.1
  Expect<Ok<[Axiom<"p", [], Pair>,
    Thm<"t", [], EqNat<Ap<Const<"Pair.rec", [L1]>, [Lam<Pair, Nat>, Lam<Nat, Lam<Nat, B<1>>>, Const<"p">]>, Proj<"Pair", 0, Const<"p">>>,
      ReflNat<Proj<"Pair", 0, Const<"p">>>>]>>,

  // unit-like types: any two inhabitants are equal
  Expect<Ok<[Axiom<"x", [], Const<"U">>, Axiom<"y", [], Const<"U">>,
    Thm<"t", [], EqC<L1, Const<"U">, Const<"x">, Const<"y">>, Refl<L1, Const<"U">, Const<"x">>>]>>,
  // ...but not for Nat
  Expect<Bad<[Axiom<"x", [], Nat>, Axiom<"y", [], Nat>,
    Thm<"t", [], EqNat<Const<"x">, Const<"y">>, ReflNat<Const<"x">>>], "declaration type mismatch">>,
];
