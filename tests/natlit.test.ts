import type { NatAdd, NatSub, NatMul, NatDiv, NatMod, NatPow, NatGcd, NatCmp, NatPred, NatNorm } from "../src/natlit";
import type { Expect, Equal } from "./util";

export type Tests = [
  Expect<Equal<NatAdd<"0", "0">, "0">>,
  Expect<Equal<NatAdd<"999", "1">, "1000">>,
  Expect<Equal<NatAdd<"123456789012345678901234567890", "987654321098765432109876543210">, "1111111110111111111011111111100">>,
  Expect<Equal<NatSub<"1000", "1">, "999">>,
  Expect<Equal<NatSub<"5", "7">, "0">>,
  Expect<Equal<NatSub<"7", "7">, "0">>,
  Expect<Equal<NatMul<"0", "12345">, "0">>,
  Expect<Equal<NatMul<"99", "99">, "9801">>,
  Expect<Equal<NatMul<"12345678901234567890", "98765432109876543210">, "1219326311370217952237463801111263526900">>,
  Expect<Equal<NatDiv<"1000", "7">, "142">>,
  Expect<Equal<NatMod<"1000", "7">, "6">>,
  Expect<Equal<NatDiv<"5", "0">, "0">>,
  Expect<Equal<NatMod<"5", "0">, "5">>,
  Expect<Equal<NatDiv<"1219326311370217952237463801111263526900", "98765432109876543210">, "12345678901234567890">>,
  Expect<Equal<NatPow<"2", "100">, "1267650600228229401496703205376">>,
  Expect<Equal<NatPow<"7", "0">, "1">>,
  Expect<Equal<NatGcd<"462", "1071">, "21">>,
  Expect<Equal<NatGcd<"0", "5">, "5">>,
  Expect<Equal<NatCmp<"10", "9">, "gt">>,
  Expect<Equal<NatCmp<"123", "124">, "lt">>,
  Expect<Equal<NatCmp<"42", "42">, "eq">>,
  Expect<Equal<NatPred<"0">, "0">>,
  Expect<Equal<NatNorm<"007">, "7">>,
];
