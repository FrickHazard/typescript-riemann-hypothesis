// Real Lean exports (lean4export NDJSON), converted by tools/lean2ts.mjs: nano-lean's test
// fixtures with its recorded verdicts (*.verdict), and core lemmas we export ourselves.

import type { Expect, Equal } from "./util";
import type { Result as Ordinary } from "../exports/generated/ordinary";
import type { Result as Smoke } from "../exports/generated/smoke";
import type { Result as Foundations } from "../exports/generated/foundations";
import type { Result as LooseBVar } from "../exports/generated/invalid-loose-bvar";
import type { Result as LooseBVarUnder } from "../exports/generated/invalid-loose-bvar-under-binder";
import type { Result as UniverseScope } from "../exports/generated/session-universe-scope";
import type { Result as UniverseSubset } from "../exports/generated/session-universe-subset";
import type { Result as Mutual } from "../exports/generated/mutual";
import type { Result as Nested } from "../exports/generated/nested";
import type { Result as NestedMinimal } from "../exports/generated/nested-minimal";
import type { Result as Primitives } from "../exports/generated/primitives";
import type { Result as Reduction } from "../exports/generated/reduction";
import type { Result as TheoremReduction } from "../exports/generated/theorem-reduction";
import type { Result as InductiveBoundaries } from "../exports/generated/inductive-boundaries";
// Exported by us from Lean 4.37.0-rc1 core (tools/export-lean.sh Init ...)
import type { Result as Nat_add_zero } from "../exports/generated/Nat.add_zero";
import type { Result as Nat_zero_add } from "../exports/generated/Nat.zero_add";
import type { Result as Nat_le_refl } from "../exports/generated/Nat.le_refl";
import type { Result as Nat_mul_one } from "../exports/generated/Nat.mul_one";
import type { Result as Nat_succ_ne_zero } from "../exports/generated/Nat.succ_ne_zero";

// Deep terms: need the lifted instantiation limits (tools/patch-typescript.mjs)
import type { Result as Nat_succ_add } from "../exports/generated/Nat.succ_add";
import type { Result as Nat_add_comm } from "../exports/generated/Nat.add_comm";
import type { Result as Nat_add_assoc } from "../exports/generated/Nat.add_assoc";
import type { Result as frame_valid_63 } from "../exports/generated/frame-valid-63";
import type { Result as frame_valid_64 } from "../exports/generated/frame-valid-64";
import type { Result as frame_valid_65 } from "../exports/generated/frame-valid-65";
import type { Result as frame_valid_70 } from "../exports/generated/frame-valid-70";
import type { Result as valid_deep_sparse_scope } from "../exports/generated/valid-deep-sparse-scope";
import type { Result as frame_wrong_value_63 } from "../exports/generated/frame-wrong-value-63";
import type { Result as frame_wrong_value_64 } from "../exports/generated/frame-wrong-value-64";
import type { Result as frame_wrong_value_65 } from "../exports/generated/frame-wrong-value-65";
import type { Result as frame_wrong_value_70 } from "../exports/generated/frame-wrong-value-70";
import type { Result as frame_missing_binder_63 } from "../exports/generated/frame-missing-binder-63";
import type { Result as frame_missing_binder_64 } from "../exports/generated/frame-missing-binder-64";
import type { Result as frame_missing_binder_65 } from "../exports/generated/frame-missing-binder-65";
import type { Result as frame_missing_binder_70 } from "../exports/generated/frame-missing-binder-70";
import type { Result as invalid_nested_parameter } from "../exports/generated/invalid-nested-parameter";

type RejectedAt<R, Name extends string> = R extends { failedAt: Name } ? true : false;

export type Tests = [
  Expect<Equal<Ordinary, true>>,
  Expect<Equal<Smoke, true>>,
  Expect<Equal<Foundations, true>>,
  Expect<RejectedAt<LooseBVar, "badLooseBinder">>,
  Expect<RejectedAt<LooseBVarUnder, "badLooseBinderInside">>,
  Expect<RejectedAt<UniverseScope, "scopeBad">>,
  Expect<RejectedAt<UniverseSubset, "narrowBad">>,
  Expect<Equal<Mutual, true>>,
  Expect<Equal<Nested, true>>,
  Expect<Equal<NestedMinimal, true>>,
  Expect<Equal<Primitives, true>>,
  Expect<Equal<Reduction, true>>,
  Expect<Equal<TheoremReduction, true>>,
  Expect<Equal<InductiveBoundaries, true>>,
  Expect<Equal<Nat_add_zero, true>>,
  Expect<Equal<Nat_zero_add, true>>,
  Expect<Equal<Nat_le_refl, true>>,
  Expect<Equal<Nat_mul_one, true>>,
  Expect<Equal<Nat_succ_ne_zero, true>>,
  Expect<Equal<Nat_succ_add, true>>,
  Expect<Equal<Nat_add_comm, true>>,
  Expect<Equal<Nat_add_assoc, true>>,
  Expect<Equal<frame_valid_63, true>>,
  Expect<Equal<frame_valid_64, true>>,
  Expect<Equal<frame_valid_65, true>>,
  Expect<Equal<frame_valid_70, true>>,
  Expect<Equal<valid_deep_sparse_scope, true>>,
  Expect<RejectedAt<frame_wrong_value_63, "frameIdentity63_wrong-value">>,
  Expect<RejectedAt<frame_wrong_value_64, "frameIdentity64_wrong-value">>,
  Expect<RejectedAt<frame_wrong_value_65, "frameIdentity65_wrong-value">>,
  Expect<RejectedAt<frame_wrong_value_70, "frameIdentity70_wrong-value">>,
  Expect<RejectedAt<frame_missing_binder_63, "frameIdentity63_missing-binder">>,
  Expect<RejectedAt<frame_missing_binder_64, "frameIdentity64_missing-binder">>,
  Expect<RejectedAt<frame_missing_binder_65, "frameIdentity65_missing-binder">>,
  Expect<RejectedAt<frame_missing_binder_70, "frameIdentity70_missing-binder">>,
  Expect<RejectedAt<invalid_nested_parameter, "E.mk">>,
];
