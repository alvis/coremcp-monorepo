/**
 * utility type that makes specified properties optional in an object type
 */
export type SetOptional<O, K extends keyof O> = O extends unknown
  ? Omit<O, K> & Partial<Pick<O, K>>
  : never;

/**
 * utility type that makes specified properties required in an object type
 */
export type SetRequired<O, K extends keyof O> = O extends unknown
  ? Omit<O, K> & Required<Pick<O, K>>
  : never;
