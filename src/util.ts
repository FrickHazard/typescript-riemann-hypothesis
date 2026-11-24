// Tuple and application-spine helpers.

import type { ToNat } from "./nat";

export type Head<E> = E extends { e: "app"; f: infer F } ? Head<F> : E;

/** Arguments of an application spine, in order. */
export type Args<E, Acc extends unknown[] = []> =
  E extends { e: "app"; f: infer F; a: infer A } ? Args<F, [A, ...Acc]> : Acc;

export type MkApps<F, As> = As extends [infer A, ...infer R] ? MkApps<{ e: "app"; f: F; a: A }, R> : F;

export type Take<T extends unknown[], N extends number, Acc extends unknown[] = []> =
  Acc["length"] extends N ? Acc : T extends [infer H, ...infer R] ? Take<R, N, [...Acc, H]> : Acc;

export type Drop<T extends unknown[], N extends number, C extends 0[] = []> =
  C["length"] extends N ? T : T extends [unknown, ...infer R] ? Drop<R, N, [...C, 0]> : [];

/** Element at index N, or null if out of range. */
export type At<T extends unknown[], N extends number> = Drop<T, N> extends [infer X, ...unknown[]] ? X : null;

export type NAdd<A extends number, B extends number> = [...ToNat<A>, ...ToNat<B>]["length"] & number;

/** A - B, or 0 when A < B. */
export type NSub<A extends number, B extends number> =
  ToNat<A> extends [...ToNat<B>, ...infer R] ? R["length"] : 0;

export type NGeq<A extends number, B extends number> = ToNat<A> extends [...ToNat<B>, ...0[]] ? true : false;

export type TakeLast<T extends unknown[], N extends number> = Drop<T, NSub<T["length"], N>>;

/** [0, 1, ..., N-1] */
export type Range<N extends number, Acc extends number[] = []> =
  Acc["length"] extends N ? Acc : Range<N, [...Acc, Acc["length"]]>;
