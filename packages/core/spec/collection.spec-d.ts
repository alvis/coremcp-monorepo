import { describe, expectTypeOf, it } from 'vitest';

import { intersect } from '#collection';

describe('ty:intersect', () => {
  it('should compute intersection of literal types', () => {
    const arr1 = ['a', 'b', 'c'] as const;
    const arr2 = ['b', 'c', 'd'] as const;
    type ExpectedType = Array<'b' | 'c'>;

    const result = intersect(arr1, arr2);

    expectTypeOf(result).toEqualTypeOf<ExpectedType>();
  });

  it('should work with type aliases of const tuples', () => {
    type T1 = ['a', 'b'];
    type T2 = ['b', 'c'];
    type ExpectedType = Array<'b'>;
    const arr1: T1 = ['a', 'b'];
    const arr2: T2 = ['b', 'c'];

    const result = intersect(arr1, arr2);

    expectTypeOf(result).toEqualTypeOf<ExpectedType>();
  });

  it('should compute type-level intersection matching Extract utility', () => {
    type Versions1 = ['2025', '2026', '2027'];
    type Versions2 = ['2026', '2027', '2028'];
    type ExpectedIntersection = Extract<Versions1[number], Versions2[number]>;
    const v1: Versions1 = ['2025', '2026', '2027'];
    const v2: Versions2 = ['2026', '2027', '2028'];

    const result = intersect(v1, v2);

    expectTypeOf(result).toEqualTypeOf<ExpectedIntersection[]>();
    expectTypeOf(result).toEqualTypeOf<Array<'2026' | '2027'>>();
  });

  it('should work with various literal types', () => {
    // number literals
    const nums1 = [1, 2, 3] as const;
    const nums2 = [2, 3, 4] as const;
    // mixed literals
    const mixed1 = ['a', 1, true] as const;
    const mixed2 = [1, true, 'b'] as const;

    const numsResult = intersect(nums1, nums2);
    const mixedResult = intersect(mixed1, mixed2);

    expectTypeOf(numsResult).toEqualTypeOf<Array<2 | 3>>();
    expectTypeOf(mixedResult).toEqualTypeOf<Array<1 | true>>();
  });

  it('should handle mutable arrays and union types', () => {
    // mutable arrays
    const arr1 = ['a', 'b', 'c'];
    const arr2 = ['b', 'c', 'd'];
    // union type arrays
    const union1: Array<'a' | 'b' | 'c'> = ['a', 'b'];
    const union2: Array<'b' | 'c' | 'd'> = ['b', 'c'];

    const mutableResult = intersect(arr1, arr2);
    const unionResult = intersect(union1, union2);

    expectTypeOf(mutableResult).toEqualTypeOf<string[]>();
    expectTypeOf(unionResult).toEqualTypeOf<Array<'b' | 'c'>>();
  });
});
