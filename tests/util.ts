export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
export type Expect<T extends true> = T;
export type ExpectFalse<T extends false> = T;
/** CheckEnv result failed with the given kernel error message. */
export type Fails<R, Msg extends string> = R extends { error: { err: Msg } } ? true : false;
