// Unary naturals as tuples: [] = 0, [0] = 1, [0, 0] = 2, ...
// Used for de Bruijn indices and universe offsets, where we need arithmetic.

export type Nat = 0[];

export type Succ<N extends Nat> = [...N, 0];

export type Pred<N extends Nat> = N extends [0, ...infer R extends Nat] ? R : [];

/** Convert a number literal to a unary Nat. */
export type ToNat<N extends number, Acc extends Nat = []> =
  Acc["length"] extends N ? Acc : ToNat<N, [...Acc, 0]>;

/** A >= B */
export type Geq<A extends Nat, B extends Nat> = A extends [...B, ...0[]] ? true : false;

/** A > B */
export type Gt<A extends Nat, B extends Nat> = A extends [...B, 0, ...0[]] ? true : false;
