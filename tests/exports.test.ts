// Real Lean exports (lean4export NDJSON, from nano-lean's test fixtures),
// converted by tools/lean2ts.mjs. Expected verdicts are nano-lean's (*.verdict).

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
];
