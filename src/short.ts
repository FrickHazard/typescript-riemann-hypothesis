// Short names for the generated proof files (tools/modts.mjs): plain re-exports of the
// kernel's constructors, so they are the same types with no extra alias layer for tsc.
export type {
  App as A, Lam as L, Pi as P, Sort as S, Const as C, Let as T, Proj as J, NatLit as N, StrLit as R, B,
} from "./expr";
export type { LZero as Z, LSucc as U, LMax as M, LIMax as I, LParam as Q } from "./level";
export type {
  Axiom as Ax, Defn as Df, Thm as Th, Opaque as Op, QuotDecl as Qu, Induct as In, Ctor as Ct, Rec as Rc, RecRule as RR,
} from "./decl";
