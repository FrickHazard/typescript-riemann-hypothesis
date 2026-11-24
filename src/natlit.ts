// Arbitrary-precision natural number arithmetic on decimal strings, at the type level.
// This backs the kernel's Nat literal extension (Lean's GMP acceleration), as in
// nano-lean's `checker/nat.rs`. Internally numbers are little-endian digit tuples.

type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type Digits = Digit[];

type CharDigit = { "0": 0; "1": 1; "2": 2; "3": 3; "4": 4; "5": 5; "6": 6; "7": 7; "8": 8; "9": 9 };
type DT = [[], [0], [0, 0], [0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0]];
type Ten = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

// Lookup tables for 0..99: value mod 10 and value div 10.
type Mod10 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
type Div10 = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9];

// ---------------------------------------------------------------------------
// Conversions

type Parse<S extends string, Acc extends Digits = []> =
  S extends `${infer C extends keyof CharDigit}${infer R}` ? Parse<R, [CharDigit[C], ...Acc]> : Trim<Acc>;

/** Drop most-significant zeros (trailing in little-endian). */
type Trim<D extends Digits> = D extends [...infer R extends Digits, 0] ? Trim<R> : D;

type Show<D extends Digits, Acc extends string = ""> =
  D extends [infer H extends Digit, ...infer R extends Digits] ? Show<R, `${H}${Acc}`> :
  Acc extends "" ? "0" : Acc;

// ---------------------------------------------------------------------------
// Addition / subtraction

type AddStep<A extends Digit, B extends Digit, C extends 0 | 1> =
  [...DT[A], ...DT[B], ...DT[C]]["length"] extends infer S extends number ? [Mod10[S], Div10[S]] : never;

type AddD<A extends Digits, B extends Digits, C extends 0 | 1 = 0, Acc extends Digits = []> =
  A extends [infer a extends Digit, ...infer AR extends Digits] ?
    B extends [infer b extends Digit, ...infer BR extends Digits] ?
      AddStep<a, b, C> extends [infer d extends Digit, infer c extends 0 | 1] ? AddD<AR, BR, c, [...Acc, d]> : never :
      AddStep<a, 0, C> extends [infer d extends Digit, infer c extends 0 | 1] ? AddD<AR, [], c, [...Acc, d]> : never :
  B extends [infer b extends Digit, ...infer BR extends Digits] ?
    AddStep<0, b, C> extends [infer d extends Digit, infer c extends 0 | 1] ? AddD<[], BR, c, [...Acc, d]> : never :
  C extends 1 ? [...Acc, 1] : Acc;

// a + 10 - b - borrow, in 1..19
type SubStep<A extends Digit, B extends Digit, Br extends 0 | 1> =
  [...DT[A], ...Ten] extends [...DT[B], ...DT[Br], ...infer R] ?
    [Mod10[R["length"]], R["length"] extends 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 ? 0 : 1] : never;

/** A - B assuming A >= B. */
type SubD<A extends Digits, B extends Digits, Br extends 0 | 1 = 0, Acc extends Digits = []> =
  A extends [infer a extends Digit, ...infer AR extends Digits] ?
    (B extends [infer b extends Digit, ...infer BR extends Digits] ? [b, BR] : [0, []]) extends
      [infer b extends Digit, infer BR extends Digits] ?
      SubStep<a, b, Br> extends [infer d extends Digit, infer br extends 0 | 1] ? SubD<AR, BR, br, [...Acc, d]> : never
    : never
  : Trim<Acc>;

// ---------------------------------------------------------------------------
// Comparison

type Ord = "lt" | "eq" | "gt";

type DigitCmp<A extends Digit, B extends Digit> =
  A extends B ? "eq" : DT[A] extends [...DT[B], ...0[]] ? "gt" : "lt";

// Same length, little-endian: the most significant difference wins.
type CmpSameLen<A extends Digits, B extends Digits, R extends Ord = "eq"> =
  A extends [infer a extends Digit, ...infer AR extends Digits] ?
    B extends [infer b extends Digit, ...infer BR extends Digits] ?
      CmpSameLen<AR, BR, DigitCmp<a, b> extends "eq" ? R : DigitCmp<a, b>> : R
  : R;

type CmpD<A extends Digits, B extends Digits> =
  A["length"] extends B["length"] ? CmpSameLen<A, B> :
  LenGt<A, B> extends true ? "gt" : "lt";

type LenGt<A extends unknown[], B extends unknown[]> =
  A extends [unknown, ...infer AR] ? (B extends [unknown, ...infer BR] ? LenGt<AR, BR> : true) : false;

// ---------------------------------------------------------------------------
// Multiplication

type Rep<X extends unknown[], K extends Digit, Acc extends unknown[] = [], I extends 0[] = []> =
  I["length"] extends K ? Acc : Rep<X, K, [...Acc, ...X], [...I, 0]>;

// a * k + carry, in 0..89
type MulStep<A extends Digit, K extends Digit, C extends Digit> =
  [...Rep<DT[A], K>, ...DT[C]]["length"] extends infer S extends number ? [Mod10[S], Div10[S]] : never;

type MulDigit<A extends Digits, K extends Digit, C extends Digit = 0, Acc extends Digits = []> =
  A extends [infer a extends Digit, ...infer AR extends Digits] ?
    MulStep<a, K, C> extends [infer d extends Digit, infer c extends Digit] ? MulDigit<AR, K, c, [...Acc, d]> : never
  : C extends 0 ? Trim<Acc> : [...Acc, C];

type MulD<A extends Digits, B extends Digits, Shift extends Digits = [], Acc extends Digits = []> =
  B extends [infer b extends Digit, ...infer BR extends Digits] ?
    MulD<A, BR, [0, ...Shift], AddD<Acc, Trim<[...Shift, ...MulDigit<A, b>]>>>
  : Trim<Acc>;

// ---------------------------------------------------------------------------
// Division (long division, most significant digit first)

type Multiples<B extends Digits> = {
  [K in Digit]: MulDigit<B, K>;
};

type Rev<D extends unknown[], Acc extends unknown[] = []> =
  D extends [infer H, ...infer R] ? Rev<R, [H, ...Acc]> : Acc;

// Largest k in 9..0 with M[k] <= R.
type QDigit<M extends Record<Digit, Digits>, R extends Digits, K extends Digit[] = [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]> =
  K extends [infer k extends Digit, ...infer KR extends Digit[]] ?
    CmpD<M[k], R> extends "gt" ? QDigit<M, R, KR> : k
  : 0;

type DivModLoop<M extends Record<Digit, Digits>, MSB extends Digits, R extends Digits = [], Q extends Digits = []> =
  MSB extends [infer d extends Digit, ...infer Rest extends Digits] ?
    Trim<[d, ...R]> extends infer R2 extends Digits ?
      QDigit<M, R2> extends infer k extends Digit ?
        DivModLoop<M, Rest, SubD<R2, M[k]>, [k, ...Q]>
      : never
    : never
  : [Trim<Q>, R];

/** [A / B, A % B]; division by zero gives [0, A] as in Lean. */
type DivModD<A extends Digits, B extends Digits> =
  B extends [] ? [[], A] : DivModLoop<Multiples<B>, Rev<A>>;

// ---------------------------------------------------------------------------
// Power (square and multiply) and gcd

type PowD<A extends Digits, E extends Digits, Acc extends Digits = [1]> =
  E extends [] ? Acc :
  DivModD<E, [2]> extends [infer H extends Digits, infer P extends Digits] ?
    PowD<MulD<A, A>, H, P extends [1] ? MulD<Acc, A> : Acc>
  : never;

type GcdD<A extends Digits, B extends Digits> =
  B extends [] ? A : GcdD<B, DivModD<A, B>[1]>;

// ---------------------------------------------------------------------------
// Public string-level API

export type NatAdd<A extends string, B extends string> = Show<AddD<Parse<A>, Parse<B>>>;
export type NatSub<A extends string, B extends string> =
  CmpD<Parse<A>, Parse<B>> extends "gt" ? Show<SubD<Parse<A>, Parse<B>>> : "0";
export type NatMul<A extends string, B extends string> = Show<MulD<Parse<A>, Parse<B>>>;
export type NatDiv<A extends string, B extends string> = Show<DivModD<Parse<A>, Parse<B>>[0]>;
export type NatMod<A extends string, B extends string> = Show<DivModD<Parse<A>, Parse<B>>[1]>;
export type NatPow<A extends string, B extends string> = Show<PowD<Parse<A>, Parse<B>>>;
export type NatGcd<A extends string, B extends string> = Show<GcdD<Parse<A>, Parse<B>>>;
export type NatCmp<A extends string, B extends string> = CmpD<Parse<A>, Parse<B>>;
export type NatSucc<A extends string> = NatAdd<A, "1">;
export type NatPred<A extends string> = NatSub<A, "1">;
/** Canonical form (strips leading zeros). */
export type NatNorm<A extends string> = Show<Parse<A>>;
