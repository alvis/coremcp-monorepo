/**
 * computes intersection of two arrays
 * @param t1 first array to intersect
 * @param t2 second array to intersect
 * @returns array containing elements present in both input arrays
 */
export function intersect<
  T1 extends readonly unknown[],
  T2 extends readonly unknown[],
>(t1: T1, t2: T2): Array<Extract<T1[number], T2[number]>> {
  const set2 = new Set(t2);
  return t1.filter((item): item is Extract<T1[number], T2[number]> =>
    set2.has(item),
  );
}
