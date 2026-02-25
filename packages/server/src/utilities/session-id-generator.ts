/**
 * session id generation utilities for mcp server
 *
 * provides functions to generate unique session identifiers with support
 * for custom generators and fallback to default base62 uuid generation.
 * @module
 */

import { generateBase62Uuid } from '@coremcp/core';

import type { Log } from '@coremcp/core';

/** custom session id generator function type */
export type SessionIdGenerator = () => string;

/**
 * generates session id using custom generator or default
 *
 * validates generated ids and falls back to default on error.
 * all errors are logged for debugging.
 * @param options generation options
 * @param options.generator optional custom session id generator
 * @param options.log optional logger for warnings and errors
 * @returns valid session id string
 */
export function generateSessionId(options?: {
  generator?: SessionIdGenerator;
  log?: Log;
}): string {
  const { generator, log } = { ...options };

  if (generator) {
    try {
      const id = generator();

      // validate: must be non-empty string
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        log?.('warn', 'sessionIdGenerator returned invalid ID, using default');

        return generateBase62Uuid();
      }

      return id;
    } catch (error) {
      log?.('error', 'sessionIdGenerator failed, using default', {
        error,
      });

      return generateBase62Uuid();
    }
  }

  return generateBase62Uuid();
}
