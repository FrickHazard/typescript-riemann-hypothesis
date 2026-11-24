import type { LevelEq, LevelLeq, LMax, LIMax, LSucc, LZero, LParam, LNum } from "../src/level";
import type { Expect, ExpectFalse } from "./util";

type u = LParam<"u">;
type v = LParam<"v">;
type w = LParam<"w">;

export type Tests = [
  Expect<LevelEq<LMax<u, u>, u>>,
  Expect<LevelEq<LIMax<u, u>, u>>,
  Expect<LevelEq<LMax<u, v>, LMax<v, u>>>,
  Expect<LevelEq<LSucc<LMax<u, v>>, LMax<LSucc<u>, LSucc<v>>>>,
  Expect<LevelEq<LIMax<u, LZero>, LZero>>,
  Expect<LevelEq<LIMax<u, LSucc<v>>, LMax<u, LSucc<v>>>>,
  Expect<LevelEq<LIMax<u, LIMax<v, w>>, LIMax<LMax<u, v>, w>>>,
  Expect<LevelEq<LIMax<LNum<2>, LNum<2>>, LNum<2>>>,
  Expect<LevelEq<LMax<LNum<1>, LIMax<u, v>>, LMax<LIMax<u, v>, LNum<1>>>>,
  Expect<LevelLeq<u, LMax<u, v>>>,
  Expect<LevelLeq<LIMax<u, v>, LMax<u, v>>>,
  Expect<LevelLeq<LNum<1>, LSucc<u>>>,
  ExpectFalse<LevelLeq<v, u>>,
  ExpectFalse<LevelLeq<LSucc<u>, u>>,
  ExpectFalse<LevelLeq<LNum<1>, u>>,
  ExpectFalse<LevelEq<LIMax<LSucc<u>, v>, LMax<LSucc<u>, v>>>, // differs at v = 0
  ExpectFalse<LevelEq<LMax<u, LNum<1>>, LSucc<u>>>,
];
