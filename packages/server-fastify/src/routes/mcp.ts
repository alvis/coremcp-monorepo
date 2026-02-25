import { jsonifyError } from '@coremcp/core';
import {
  JsonRpcError,
  MCP_ERROR_CODES,
  validateJsonRpcMessage,
} from '@coremcp/protocol';

import {
  HTTP_BAD_REQUEST,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
} from '#constants/http';
import { MCP_ERROR_TO_HTTP_STATUS } from '#constants/mcp';
import { HTTPError } from '#errors';
import { extractConnectionContext } from '#request-context';
import {
  validateAcceptHeader,
  validateContentType,
  validateProtocolVersion,
} from '#validators';

import type { McpServer } from '@coremcp/server';
import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from 'fastify';

import type { ResolveUserId } from '#types';

/**
 * registers mcp protocol routes for handling json-rpc messages over http
 * @param mcpServer the mcp server instance for request handling
 * @param resolveUserId function to resolve user identifier from request context
 * @returns fastify plugin async function that registers GET, POST, and DELETE routes
 */
export function registerMcpRoutes(
  mcpServer: McpServer,
  resolveUserId: ResolveUserId,
): FastifyPluginAsync {
  return async (fastify) => {
    fastify.get('/mcp', createMcpGetHandler(mcpServer, resolveUserId));

    fastify.post('/mcp', createMcpPostHandler(mcpServer, resolveUserId));

    fastify.delete('/mcp', createMcpDeleteHandler(mcpServer, resolveUserId));
  };
}

/**
 * creates handler for DELETE /mcp requests to terminate sessions
 * @param mcpServer the mcp server instance for session management
 * @param resolveUserId function to resolve user identifier from request context
 * @returns route handler method for session termination
 */
function createMcpDeleteHandler(
  mcpServer: McpServer,
  resolveUserId: ResolveUserId,
): RouteHandlerMethod {
  return async (request, reply): Promise<void> => {
    try {
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      validateProtocolVersion(context.protocolVersion);

      await mcpServer.terminateSession(context);

      return await reply.code(HTTP_OK).send();
    } catch (error) {
      handleError({ request, reply, error });
    }
  };
}

/**
 * creates handler for GET /mcp requests to resume broken connections
 * @param mcpServer the mcp server instance for session management
 * @param resolveUserId function to resolve user identifier from request context
 * @returns route handler method for session resumption
 * @description handles session resumption after connection loss and provides side channel for global notifications
 */
function createMcpGetHandler(
  mcpServer: McpServer,
  resolveUserId: ResolveUserId,
): RouteHandlerMethod {
  return async (request, reply): Promise<void> => {
    // NOTE: GET is for resuming a broken connection or as a side channel to receive global notifications

    try {
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      validateAcceptHeader(request, ['text/event-stream']);
      // NOTE: GET requests don't have a body, so no Content-Type validation needed
      validateProtocolVersion(context.protocolVersion);

      reply.hijack();

      // NOTE: we must send the following headers after validation as the headers sent will be different should the validation step fail
      // configure response as server-sent events stream using raw methods after hijack
      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache, no-transform');
      reply.raw.setHeader('connection', 'keep-alive');

      await mcpServer.resumeMessage(context);
    } catch (error) {
      return handleError({ request, reply, error });
    }
  };
}

/**
 * creates handler for POST /mcp requests to process json-rpc messages
 * @param mcpServer the mcp server instance for message handling
 * @param resolveUserId function to resolve user identifier from request context
 * @returns route handler method for request processing
 * @description processes all json-rpc requests including initialization and session-based operations
 */
function createMcpPostHandler(
  mcpServer: McpServer,
  resolveUserId: ResolveUserId,
): RouteHandlerMethod {
  // NOTE: POST is for all requests
  return async (request, reply): Promise<void> => {
    let isHijacked = false;

    try {
      // extract context and validate (can throw errors)
      const context = await extractConnectionContext(
        request,
        reply,
        resolveUserId,
      );

      validateAcceptHeader(request, ['application/json', 'text/event-stream']);
      validateContentType(request);
      validateProtocolVersion(context.protocolVersion);

      // parse and validate the json-rpc message
      const message = validateJsonRpcMessage(request.body);

      // validation passed - now hijack the response for SSE streaming
      reply.hijack();
      isHijacked = true;

      // NOTE: we must send the following headers after validation as the headers sent will be different should the validation step fail
      // configure response as server-sent events stream using raw methods after hijack
      reply.raw.setHeader('content-type', 'text/event-stream');
      reply.raw.setHeader('cache-control', 'no-cache, no-transform');
      reply.raw.setHeader('connection', 'keep-alive');

      // handle message with callback to set session ID header on initialization
      await mcpServer.handleMessage(message, context, {
        onInitialize: (session) => {
          // set session ID header so client can use it for subsequent requests
          reply.raw.setHeader('Mcp-Session-Id', session.id);
        },
      });

      // close the connection when the request has completed
      await new Promise<void>((resolve) => reply.raw.end(resolve));
    } catch (error) {
      // handle errors based on hijack status
      if (isHijacked) {
        // use raw methods after hijack
        const statusCode =
          error instanceof JsonRpcError
            ? (MCP_ERROR_TO_HTTP_STATUS[error.code] ?? HTTP_BAD_REQUEST)
            : HTTP_INTERNAL_SERVER_ERROR;

        const errorResponse = {
          jsonrpc: '2.0' as const,
          id: null,
          error:
            error instanceof JsonRpcError
              ? {
                  code: error.code,
                  message: error.message,
                  ...(error.data ? { data: error.data } : {}),
                }
              : {
                  code: MCP_ERROR_CODES.INTERNAL_ERROR,
                  message: 'Internal error',
                },
        };

        reply.raw.statusCode = statusCode;
        reply.raw.setHeader('content-type', 'application/json');
        reply.raw.end(JSON.stringify(errorResponse));
      } else {
        // normal error handling before hijack
        return handleError({ request, reply, error });
      }
    }
  };
}

/**
 * handles errors from mcp route handlers with appropriate http responses
 * @param params error handling parameters
 * @param params.request the fastify request object
 * @param params.reply the fastify reply object
 * @param params.error the error to handle (HTTPError, JsonRpcError, or unknown)
 * @returns fastify reply with error response
 */
function handleError(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  error: unknown;
}): FastifyReply {
  const { request, reply, error } = params;

  if (error instanceof HTTPError) {
    return reply.code(error.code).headers(error.headers).send(error.body);
  } else if (error instanceof JsonRpcError) {
    return reply
      .code(MCP_ERROR_TO_HTTP_STATUS[error.code] ?? HTTP_BAD_REQUEST)
      .send({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: error.code,
          message: error.message,
        },
      });
  } else if (
    error instanceof Error &&
    error.message.includes('Invalid JSON-RPC message')
  ) {
    // validation error from validateJsonRpcMessage - convert to JSON-RPC parse error
    return reply.code(HTTP_BAD_REQUEST).send({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: MCP_ERROR_CODES.PARSE_ERROR,
        message: error.message,
      },
    });
  } else {
    request.log.error({
      error: jsonifyError(error),
      url: request.url,
      method: request.method,
      headers: request.headers,
    });

    return reply.code(HTTP_BAD_REQUEST).send({
      error: 'Internal Server Error',
      message:
        'An unexpected error occurred processing the MCP request. Check server logs for details.',
    });
  }
}
