// Declarations, mirroring nano-lean's `term/decl.rs` (`Declar`).

/** Reducibility hint: lazy delta unfolds the higher definition first. */
export type Hint = "opaque" | "abbrev" | number;

type Info<N extends string, Ps extends string[], T> = { name: N; lparams: Ps; type: T };

export type Axiom<N extends string, Ps extends string[], T> = { kind: "axiom" } & Info<N, Ps, T>;
export type Defn<N extends string, Ps extends string[], T, V, H extends Hint = 0> =
  { kind: "defn"; value: V; hint: H } & Info<N, Ps, T>;
export type Thm<N extends string, Ps extends string[], T, V> = { kind: "thm"; value: V } & Info<N, Ps, T>;
export type Opaque<N extends string, Ps extends string[], T, V> = { kind: "opaque"; value: V } & Info<N, Ps, T>;
/** Quot, Quot.mk, Quot.lift, Quot.ind */
export type QuotDecl<N extends string, Ps extends string[], T> = { kind: "quot" } & Info<N, Ps, T>;

export type Induct<N extends string, Ps extends string[], T, I extends {
  numParams: number; numIndices: number; ctors: string[]; isRec: boolean; all?: string[];
}> = { kind: "induct" } & I & Info<N, Ps, T>;

export type Ctor<N extends string, Ps extends string[], T, I extends {
  induct: string; cidx: number; numParams: number; numFields: number;
}> = { kind: "ctor" } & I & Info<N, Ps, T>;

export type RecRule<C extends string, NF extends number, Rhs> = { ctor: C; nfields: NF; rhs: Rhs };

export type Rec<N extends string, Ps extends string[], T, I extends {
  numParams: number; numIndices: number; numMotives: number; numMinors: number;
  rules: RecRule<string, number, unknown>[]; k: boolean; all?: string[];
}> = { kind: "rec" } & I & Info<N, Ps, T>;

export type Decl = { kind: string; name: string; lparams: string[]; type: unknown };

/**
 * Proof irrelevance at a module boundary: once a theorem is checked, later declarations
 * need only its statement. Exporting it as an axiom with the same type is sound (it was
 * just proved); it is incomplete only if a later check would need to unfold the proof,
 * which Lean's kernel tries last (theorems have the lowest reducibility).
 */
export type AsAxiom<D> =
  D extends { kind: "thm"; name: infer N extends string; lparams: infer Ps extends string[]; type: infer T } ?
    Axiom<N, Ps, T> : D;
