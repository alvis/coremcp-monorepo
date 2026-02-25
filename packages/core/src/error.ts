import type { JsonifibleObject, JsonObject } from '@coremcp/protocol';

/**
 * converts any error caught in a try-catch block to a json-compatible format
 * @param error any value that was thrown/caught
 * @returns a json-serializable representation of the error
 */
export function jsonifyError(error: unknown): JsonifibleObject {
  const type = typeof error;

  switch (typeof error) {
    case 'object':
      if (error instanceof Error) {
        return {
          type: 'Error',
          name: error.name,
          message: error.message,
          stack: error.stack,
          ...(error instanceof AggregateError && {
            errors: error.errors.map(jsonifyError),
          }),
          ...('cause' in error &&
            error.cause !== undefined && { cause: jsonifyError(error.cause) }),
        };
      } else if (error === null) {
        return { type: 'null', value: error };
      } else {
        const toString = Object.prototype.toString.call(error);
        if (
          toString === '[object WeakMap]' ||
          toString === '[object WeakSet]' ||
          toString === '[object Map]' ||
          toString === '[object Set]'
        ) {
          return { type: 'unknown', toString };
        }

        const serialized = JSON.parse(
          JSON.stringify(error, getCircularReplacer()),
        ) as JsonObject;

        return {
          type: Array.isArray(error) ? 'array' : 'object',
          value: serialized,
        };
      }
    case 'boolean':
    case 'number':
    case 'string':
    case 'undefined':
      return { type, value: error };
    case 'function':
      return { type, name: error.name || 'anonymous' };
    case 'bigint':
      return { type, value: String(error) };
    case 'symbol':
      return { type, description: error.description };
    default:
      return { type: 'unknown' };
  }
}

/**
 * creates a replacer function that handles circular references
 * @returns function that replaces circular references for json.stringify
 */
function getCircularReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet();

  return (_key: string, value: unknown) => {
    if (typeof value === 'function') {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }

    return value;
  };
}
