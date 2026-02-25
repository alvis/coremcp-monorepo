import { describe, expect, it } from 'vitest';

import { jsonifyError } from '#error';

describe('fn:jsonifyError', () => {
  it('should handle Error objects with name, message, and stack', () => {
    const error = new Error('Test error message');

    const result = jsonifyError(error);

    expect(result).toEqual({
      type: 'Error',
      name: 'Error',
      message: 'Test error message',
      stack: expect.stringContaining('Error: Test error message'),
    });
  });

  it('should handle TypeError', () => {
    const error = new TypeError('Type error message');

    const result = jsonifyError(error);

    expect(result).toEqual({
      type: 'Error',
      name: 'TypeError',
      message: 'Type error message',
      stack: expect.stringContaining('TypeError: Type error message'),
    });
  });

  it('should handle custom error classes', () => {
    class CustomError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'CustomError';
      }
    }
    const error = new CustomError('Custom error message');

    const result = jsonifyError(error);

    expect(result).toEqual({
      type: 'Error',
      name: 'CustomError',
      message: 'Custom error message',
      stack: expect.stringContaining('CustomError: Custom error message'),
    });
  });

  it('should handle AggregateError with recursive error processing', () => {
    const error1 = new Error('First error');
    const error2 = new TypeError('Second error');
    const aggregateError = new AggregateError(
      [error1, error2],
      'Multiple errors',
    );

    const result = jsonifyError(aggregateError);

    expect(result).toEqual({
      type: 'Error',
      name: 'AggregateError',
      message: 'Multiple errors',
      stack: expect.stringContaining('AggregateError: Multiple errors'),
      errors: [
        {
          type: 'Error',
          name: 'Error',
          message: 'First error',
          stack: expect.stringContaining('Error: First error'),
        },
        {
          type: 'Error',
          name: 'TypeError',
          message: 'Second error',
          stack: expect.stringContaining('TypeError: Second error'),
        },
      ],
    });
  });

  it('should handle error with cause', () => {
    const cause = new Error('Root cause');
    const error = new Error('Error with cause', { cause });

    const result = jsonifyError(error);

    expect(result).toEqual({
      type: 'Error',
      name: 'Error',
      message: 'Error with cause',
      stack: expect.stringContaining('Error: Error with cause'),
      cause: {
        type: 'Error',
        name: 'Error',
        message: 'Root cause',
        stack: expect.stringContaining('Error: Root cause'),
      },
    });
  });

  describe.each([
    ['string', 'string error', { type: 'string', value: 'string error' }],
    ['number', 404, { type: 'number', value: 404 }],
    ['boolean true', true, { type: 'boolean', value: true }],
    ['boolean false', false, { type: 'boolean', value: false }],
    ['null', null, { type: 'null', value: null }],
    ['undefined', undefined, { type: 'undefined', value: undefined }],
  ])('with primitive type: %s', (_name, input, expected) => {
    it('should return type and value', () => {
      const result = jsonifyError(input);

      expect(result).toEqual(expected);
    });
  });

  it('should handle symbol with description', () => {
    const sym = Symbol('test symbol');

    const result = jsonifyError(sym);

    expect(result).toEqual({
      type: 'symbol',
      description: 'test symbol',
    });
  });

  it('should handle bigint as string value', () => {
    const bigInt = BigInt('9007199254740992');

    const result = jsonifyError(bigInt);

    expect(result).toEqual({
      type: 'bigint',
      value: '9007199254740992',
    });
  });

  it('should handle named function', () => {
    const fn = function testFunction() {
      return 'test';
    };

    const result = jsonifyError(fn);

    expect(result).toEqual({
      type: 'function',
      name: 'testFunction',
    });
  });

  it('should handle arrow function with inferred name', () => {
    const anonymousFn = () => 'test';

    const result = jsonifyError(anonymousFn);

    expect(result).toEqual({
      type: 'function',
      name: 'anonymousFn',
    });
  });

  it('should handle plain object', () => {
    const obj = { message: 'Object error', code: 42 };

    const result = jsonifyError(obj);

    expect(result).toEqual({ type: 'object', value: obj });
  });

  it('should handle array', () => {
    const arr = ['Error 1', 'Error 2'];

    const result = jsonifyError(arr);

    expect(result).toEqual({ type: 'array', value: arr });
  });

  it('should handle circular references', () => {
    interface CircularObject {
      message: string;
      self?: CircularObject;
    }
    const obj: CircularObject = { message: 'Circular error' };
    obj.self = obj;

    const result = jsonifyError(obj);

    expect(result).toEqual({
      type: 'object',
      value: { message: 'Circular error', self: '[Circular]' },
    });
  });

  it('should handle non-serializable objects as unknown', () => {
    const weirdError = new WeakMap();

    const result = jsonifyError(weirdError);

    expect(result).toEqual({
      type: 'unknown',
      toString: '[object WeakMap]',
    });
  });

  it('should throw when objects with throwing toJSON are encountered', () => {
    const error = {
      message: 'Error with bad toJSON',
      toJSON() {
        throw new Error('toJSON failed');
      },
    };
    const expected = new Error('toJSON failed');

    expect(() => jsonifyError(error)).toThrow(expected);
  });

  it('should handle objects with working toJSON method', () => {
    const error = {
      message: 'Error with good toJSON',
      toJSON() {
        return { serialized: true, message: this.message };
      },
    };

    const result = jsonifyError(error);

    expect(result).toEqual({
      type: 'object',
      value: { serialized: true, message: 'Error with good toJSON' },
    });
  });
});
