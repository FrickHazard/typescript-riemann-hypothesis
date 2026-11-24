// Slow checks (minutes each), run with `npm run check:slow`.
import type { Expect, Equal } from "../tests/util";
import type { Result as Nat_lt_irrefl } from "../exports/generated/Nat.lt_irrefl";
import type { Result as ProjectionProp } from "../exports/generated/projection-prop";

type RejectedAt<R, Name extends string> = R extends { failedAt: Name } ? true : false;

export type Tests = [
  Expect<Equal<Nat_lt_irrefl, true>>,                             // ~105 s
  Expect<RejectedAt<ProjectionProp, "PR14806Subst.observe">>,      // ~300 s, projection eliminates a Prop
];
