import type { McpServer } from '@coremcp/server';
import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * handler context for processing MCP requests
 */
export interface HandlerContext {
  request: FastifyRequest;
  reply: FastifyReply;
  server: McpServer;
}

/** pending response context for tracking request-response pairs */
export interface PendingResponse {
  /** fastify reply object for the pending request */
  reply: FastifyReply;
  /** session identifier for the request */
  sessionId: string;
}

export type ResolveUserId = (
  request: FastifyRequest,
) => Promise<string | undefined>;
