import { SUPPORTED_PROTOCOL_VERSIONS } from '@coremcp/protocol';

import { DEFAULT_HTTPS_PORT, DEFAULT_HTTP_PORT } from '#constants/defaults';

import type { IncomingHttpHeaders } from 'node:http';

import type { ConnectionContext } from '@coremcp/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ResolveUserId } from '#types';

/**
 * extracts the last value from http headers when multiple values exist
 * @param headers incoming http headers object
 * @param header header name to extract
 * @returns last header value or undefined if not found
 */
export function lastHeader(
  headers: IncomingHttpHeaders,
  header: string,
): string | undefined {
  const targetHeader = header.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === targetHeader) {
      if (Array.isArray(value)) {
        return value[value.length - 1];
      }

      return value;
    }
  }

  return undefined;
}

/**
 * extracts bearer token from authorization header
 * @param header authorization header value
 * @returns extracted token or undefined if invalid format
 */
export function extractBearerToken(
  header: string | undefined,
): string | undefined {
  if (!header?.match(/^bearer /i)) {
    return undefined;
  }

  return header.replace(/^bearer /i, '');
}

/**
 * extracts connection context from fastify request/reply objects for mcp transport
 * @param request fastify request object containing headers and other request data
 * @param reply fastify reply object for sending responses
 * @param resolveUserId function to resolve user identifier from request context
 * @returns connection context object with transport type, send function, sessionId, and auth token
 */
export async function extractConnectionContext(
  request: FastifyRequest,
  reply: FastifyReply,
  resolveUserId: ResolveUserId,
): Promise<ConnectionContext> {
  const sessionId = lastHeader(request.headers, 'mcp-session-id');
  const protocolVersion =
    lastHeader(request.headers, 'mcp-protocol-version') ??
    // fallback to the default version if not specified
    SUPPORTED_PROTOCOL_VERSIONS[0];
  const lastEventId = lastHeader(request.headers, 'last-event-id');

  const abortController = new AbortController();

  const { promise: waitUntilClosed, resolve: signalConnectionClosed } =
    Promise.withResolvers<void>();

  request.raw.on('close', () => {
    // NOTE:
    // request.raw.aborted has been deprecated
    // the alternative is to check whether the socket is still writable to rule out the cases that the request is destroyed due to server not client (e.g. timeout)
    // by design, background operations will continue even if the client disconnected so that it can be picked up later
    if (request.raw.destroyed && !reply.raw.writableEnded) {
      abortController.abort();
    }

    signalConnectionClosed();
  });

  return {
    transport: 'http',
    channelId: `http:${request.method.toUpperCase()}:${request.id}`,
    userId: await resolveUserId(request),
    sessionId,
    protocolVersion,
    lastEventId,
    abortSignal: abortController.signal,
    waitUntilClosed,
    write: async (message) => {
      // NOTE: we use raw.write so that it can continuously write to the channel
      // SSE format requires "data: <json>\n\n" for each message

      // check if the channel is still writable to avoid error thrown in case it is disconnected
      reply.raw.writable &&
        reply.raw.write(`data: ${JSON.stringify(message)}\n\n`);
    },
  };
}

/**
 * infers the base url from a fastify request, handling proxy headers
 * @param request fastify request object containing headers and connection info
 * @returns the inferred base url including protocol and host
 */
export function inferBaseUrlFromRequest(request: FastifyRequest): string {
  const isDefaultPort =
    request.port === DEFAULT_HTTP_PORT || request.port === DEFAULT_HTTPS_PORT;

  const protocol =
    (lastHeader(request.headers, 'x-forwarded-proto') ??
    request.port === DEFAULT_HTTPS_PORT)
      ? 'https'
      : request.protocol;

  const host =
    lastHeader(request.headers, 'x-forwarded-host') ??
    `${request.hostname}${isDefaultPort ? '' : ':' + request.port}`;

  return `${protocol}://${host}`;
}
