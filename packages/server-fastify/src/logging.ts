import { HTTP_NOT_FOUND } from '#constants/http';

import type { LogLevel } from '@coremcp/core';
import type { JsonifibleObject } from '@coremcp/protocol';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';

/** function type for custom logging */
export type Log = (
  level: LogLevel,
  message: string,
  data?: JsonifibleObject,
) => void;

/**
 * creates fastify logger configuration that bridges to a custom log function
 * when no log function is provided, logging is disabled
 * @param log optional custom logging function
 * @returns fastify logger configuration object
 * @example
 * ```typescript
 * const fastify = Fastify({
 *   logger: createLoggerConfig((level, message, data) => {
 *     console.log(`[${level}] ${message}`, data);
 *   }),
 * });
 * ```
 */
export function createLoggerConfig(log?: Log): FastifyServerOptions['logger'] {
  if (!log) {
    return false;
  }

  return {
    level: 'trace',
    messageKey: 'message',
    errorKey: 'error',
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    // bridge fastify's pino logger to our custom Log function
    stream: {
      write: (msg: string) => {
        try {
          const parsed = JSON.parse(msg) as Record<string, unknown>;

          const level =
            typeof parsed.level === 'string'
              ? (parsed.level as LogLevel)
              : 'info';
          const message =
            typeof parsed.message === 'string' ? parsed.message : '';

          // extract metadata (excluding level and message)
          // NOTE: we safely cast to JsonifibleObject since this data came from JSON.parse
          const { level: _l, message: _m, ...rawMeta } = parsed;

          if (Object.keys(rawMeta).length > 0) {
            log(level, message, rawMeta as JsonifibleObject);
          } else {
            log(level, message);
          }
        } catch {
          // fallback for non-JSON log messages
          log('info', msg.trim());
        }
      },
    },
  };
}

/**
 * configures comprehensive request/response logging for debugging and monitoring
 * @param _server the fastify server instance to configure
 */
export function setupLogging(_server: FastifyInstance): void {
  // minimal logging for now
}

/**
 * sets up the catch-all route handler for undefined routes
 * @param server the fastify server instance to configure
 */
export function setupNotFoundHandler(server: FastifyInstance): void {
  server.setNotFoundHandler(async (request, reply) => {
    return reply.code(HTTP_NOT_FOUND).send({
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
      timestamp: new Date().toISOString(),
    });
  });
}
