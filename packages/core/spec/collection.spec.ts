import { describe, expect, it } from 'vitest';

import { intersect } from '#collection';

describe('fn:intersect', () => {
  it('should return common elements preserving order from first array', () => {
    const arr1 = ['z', 'b', 'y', 'x'];
    const arr2 = ['x', 'y', 'b'];
    const expected = ['b', 'y', 'x'];

    const result = intersect(arr1, arr2);

    expect(result).toEqual(expected);
  });

  it('should return empty array when no common elements exist', () => {
    const arr1 = ['a', 'b'];
    const arr2 = ['c', 'd'];
    const expected: string[] = [];

    const result = intersect(arr1, arr2);

    expect(result).toEqual(expected);
  });

  it('should return empty array when first array is empty', () => {
    const result = intersect([], ['a', 'b']);

    expect(result).toEqual([]);
  });

  it('should return empty array when second array is empty', () => {
    const result = intersect(['a', 'b'], []);

    expect(result).toEqual([]);
  });

  it('should return empty array when both arrays are empty', () => {
    const result = intersect([], []);

    expect(result).toEqual([]);
  });

  it('should preserve all occurrences from first array when element exists in second', () => {
    const arr1 = ['a', 'b', 'b', 'c', 'b'];
    const arr2 = ['b', 'c'];
    const expected = ['b', 'b', 'c', 'b'];

    const result = intersect(arr1, arr2);

    expect(result).toEqual(expected);
  });

  it('should work with number arrays', () => {
    const result = intersect([1, 2, 3], [2, 3, 4]);

    expect(result).toEqual([2, 3]);
  });

  it('should work with const arrays', () => {
    const arr1 = ['2025-06-18', '2025-03-26'] as const;
    const arr2 = ['2025-06-18', '2023-01-01'] as const;

    const result = intersect(arr1, arr2);

    expect(result).toEqual(['2025-06-18']);
  });

  it('should work with null and undefined values', () => {
    const result = intersect([null, undefined, 'a'], [undefined, 'a']);

    expect(result).toEqual([undefined, 'a']);
  });
});
