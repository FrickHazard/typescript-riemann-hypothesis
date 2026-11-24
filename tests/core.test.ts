import type { Sort, Const, Lam, Pi, Let, B, Ap, App } from "../src/expr";
import type { LZero, LParam, LNum } from "../src/level";
import type { Axiom, Defn, Thm } from "../src/decl";
import type { CheckEnv } from "../src/check";
import type { Expect, Equal, Fails } from "./util";

type u = LParam<"u">;
type Prop = Sort<LZero>;
type Type = Sort<LNum<1>>;
type L2 = LNum<2>;

// Eq.{u} : {α : Sort u} → α → α → Prop        Eq.refl.{u} : (α : Sort u) → (a : α) → Eq α a a
type EqD = Axiom<"Eq", ["u"], Pi<Sort<u>, Pi<B<0>, Pi<B<1>, Prop>>>>;
type EqRefl = Axiom<"Eq.refl", ["u"], Pi<Sort<u>, Pi<B<0>, Ap<Const<"Eq", [u]>, [B<1>, B<0>, B<0>]>>>>;
type Eq<L, T, X, Y> = Ap<Const<"Eq", [L]>, [T, X, Y]>;
type Refl<L, T, X> = Ap<Const<"Eq.refl", [L]>, [T, X]>;

// id.{u} : (α : Sort u) → α → α
type Id = Defn<"id", ["u"], Pi<Sort<u>, Pi<B<0>, B<1>>>, Lam<Sort<u>, Lam<B<0>, B<0>>>>;

// Church numerals: CNat : Type 1 := (α : Type) → (α → α) → α → α
type CNat = Const<"CNat">;
type CNatD = Defn<"CNat", [], Sort<L2>, Pi<Type, Pi<Pi<B<0>, B<1>>, Pi<B<1>, B<2>>>>>;
type CZero = Defn<"czero", [], CNat, Lam<Type, Lam<Pi<B<0>, B<1>>, Lam<B<1>, B<0>>>>>;
// csucc n α f x := f (n α f x)
type CSucc = Defn<"csucc", [], Pi<CNat, CNat>,
  Lam<CNat, Lam<Type, Lam<Pi<B<0>, B<1>>, Lam<B<1>, App<B<1>, Ap<B<3>, [B<2>, B<1>, B<0>]>>>>>>>;
// cadd m n α f x := m α f (n α f x)
type CAdd = Defn<"cadd", [], Pi<CNat, Pi<CNat, CNat>>,
  Lam<CNat, Lam<CNat, Lam<Type, Lam<Pi<B<0>, B<1>>, Lam<B<1>, Ap<B<4>, [B<2>, B<1>, Ap<B<3>, [B<2>, B<1>, B<0>]>]>>>>>>>;
type S<N> = App<Const<"csucc">, N>;
type Two = Defn<"two", [], CNat, S<S<Const<"czero">>>>;
type Three = Defn<"three", [], CNat, S<Const<"two">>>;
type Four = Defn<"four", [], CNat, S<S<Const<"two">>>>;

type Base = [EqD, EqRefl, Id, CNatD, CZero, CSucc, CAdd, Two, Three, Four];
type Add<X, Y> = Ap<Const<"cadd">, [X, Y]>;

// Fixtures for proof irrelevance and eta.
type PropAx = [
  Axiom<"P", [], Prop>, Axiom<"p", [], Const<"P">>, Axiom<"q", [], Const<"P">>,
  Axiom<"f", [], Pi<CNat, CNat>>,
];

export type Tests = [
  Expect<Equal<CheckEnv<Base>, true>>,

  // 2 + 2 = 4 by rfl (delta + beta under binders)
  Expect<Equal<CheckEnv<[...Base,
    Thm<"two_add_two", [], Eq<L2, CNat, Add<Const<"two">, Const<"two">>, Const<"four">>, Refl<L2, CNat, Const<"four">>>,
  ]>, true>>,

  // 2 + 2 = 3 must fail
  Expect<Fails<CheckEnv<[...Base,
    Thm<"bad", [], Eq<L2, CNat, Add<Const<"two">, Const<"two">>, Const<"three">>, Refl<L2, CNat, Const<"three">>>,
  ]>, "declaration type mismatch">>,

  // universe-polymorphic constant instantiated at a concrete level
  Expect<Equal<CheckEnv<[...Base, Defn<"idC", [], Pi<CNat, CNat>, App<Const<"id", [L2]>, CNat>>]>, true>>,

  // let
  Expect<Equal<CheckEnv<[...Base, Defn<"l", [], CNat, Let<CNat, Const<"two">, Add<B<0>, B<0>>>>,
    Thm<"l4", [], Eq<L2, CNat, Const<"l">, Const<"four">>, Refl<L2, CNat, Const<"four">>>]>, true>>,

  // proof irrelevance: p = q for p q : P : Prop
  Expect<Equal<CheckEnv<[...Base, ...PropAx,
    Thm<"pi", [], Eq<LZero, Const<"P">, Const<"p">, Const<"q">>, Refl<LZero, Const<"P">, Const<"p">>>]>, true>>,

  // eta: (λ x. f x) = f ; also exercises Sort (imax 2 2) ≡ Sort 2
  Expect<Equal<CheckEnv<[...Base, ...PropAx,
    Thm<"eta", [], Eq<L2, Pi<CNat, CNat>, Lam<CNat, App<Const<"f">, B<0>>>, Const<"f">>, Refl<L2, Pi<CNat, CNat>, Const<"f">>>]>, true>>,

  // delta inside a binder: (λ α x. x) = (λ α x. id α x)
  Expect<Equal<CheckEnv<[...Base,
    Thm<"idEta", [], Eq<L2, Pi<Type, Pi<B<0>, B<1>>>, Lam<Type, Lam<B<0>, B<0>>>, Lam<Type, Lam<B<0>, Ap<Const<"id", [LNum<1>]>, [B<1>, B<0>]>>>>,
      Refl<L2, Pi<Type, Pi<B<0>, B<1>>>, Lam<Type, Lam<B<0>, B<0>>>>>]>, true>>,

  // --- errors ---
  // deep near-miss: 4 = 5 differs only at the innermost application
  Expect<Fails<CheckEnv<[...Base,
    Thm<"bad45", [], Eq<L2, CNat, Const<"four">, S<Const<"four">>>, Refl<L2, CNat, Const<"four">>>]>, "declaration type mismatch">>,
  // p = q needs proof irrelevance only for Props: two distinct CNat axioms are not equal
  Expect<Fails<CheckEnv<[...Base, Axiom<"m", [], CNat>, Axiom<"n", [], CNat>,
    Thm<"bad_mn", [], Eq<L2, CNat, Const<"m">, Const<"n">>, Refl<L2, CNat, Const<"m">>>]>, "declaration type mismatch">>,
  Expect<Fails<CheckEnv<[Defn<"x", [], Sort<u>, Prop>]>, "undeclared universe parameter">>,
  Expect<Fails<CheckEnv<[...Base, Defn<"x", [], CNat, Const<"nope">>]>, "unknown constant">>,
  Expect<Fails<CheckEnv<[...Base, Defn<"x", [], CNat, Const<"id">>]>, "wrong number of universe levels">>,
  Expect<Fails<CheckEnv<[...Base, Thm<"x", [], CNat, Const<"two">>]>, "theorem type is not a proposition">>,
  Expect<Fails<CheckEnv<[...Base, Defn<"x", [], CNat, App<Const<"csucc">, Type>>]>, "application type mismatch">>,
  Expect<Fails<CheckEnv<[...Base, Defn<"x", [], CNat, App<Const<"two">, Const<"two">>>]>, "application type mismatch">>,
  Expect<Fails<CheckEnv<[...Base, Defn<"two", [], CNat, Const<"czero">>]>, "already declared">>,
  Expect<Fails<CheckEnv<[Defn<"x", [], Const<"Prop">, Prop>]>, "unknown constant">>,
];
