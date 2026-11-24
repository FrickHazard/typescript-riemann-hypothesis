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
];
