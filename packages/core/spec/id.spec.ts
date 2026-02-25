import { describe, expect, it } from 'vitest';

import { generateBase62Uuid } from '#id';

describe('fn:generateBase62Uuid', () => {
  it('should generate base62 representation of UUID', () => {
    const result = generateBase62Uuid();

    expect(result).toMatch(/^[0-9A-Za-z]+$/);
    expect(result).not.toContain('-');
  });

  it('should generate unique values on multiple calls', () => {
    const results = new Set();
    for (let i = 0; i < 10; i++) {
      results.add(generateBase62Uuid());
    }

    expect(results.size).toBe(10);
  });
});
