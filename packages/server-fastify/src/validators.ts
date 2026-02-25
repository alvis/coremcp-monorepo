import {
  MCP_ERROR_CODES,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@coremcp/protocol';

import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_ACCEPTABLE,
  HTTP_UNSUPPORTED_MEDIA_TYPE,
} from '#constants/http';

import { HTTPError } from '#errors';

import type { FastifyRequest } from 'fastify';

/**
 * validates mcp protocol version from request headers
 * @param protocolVersion the protocol version to check against
 */
export function validateProtocolVersion(protocolVersion?: string): void {
  if (
    !(
      SUPPORTED_PROTOCOL_VERSIONS as Readonly<Array<string | undefined>>
    ).includes(protocolVersion)
  ) {
    const supportedVersions = SUPPORTED_PROTOCOL_VERSIONS.join(', ');

    throw new HTTPError({
      code: HTTP_BAD_REQUEST,
      body: {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: MCP_ERROR_CODES.TOOL_ERROR,
          message: `Bad Request: Unsupported protocol version (supported versions: ${supportedVersions})`,
        },
      },
    });
  }
}

/**
 * validates request content type for json-rpc
 * @param request the fastify request object
 */
export function validateContentType(request: FastifyRequest): void {
  const contentType = request.headers['content-type'];

  if (!contentType?.includes('application/json')) {
    throw new HTTPError({
      code: HTTP_UNSUPPORTED_MEDIA_TYPE,
      body: {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: MCP_ERROR_CODES.TOOL_ERROR,
          message:
            'Unsupported Media Type: Content-Type must be application/json',
        },
      },
    });
  }
}

/**
 * validates accept header for json responses
 * @param request the fastify request object
 * @param accepts array of accepted content types
 */
export function validateAcceptHeader(
  request: FastifyRequest,
  accepts: string[],
): void {
  const accept = request.headers.accept;
  const hasValidAccept = accepts.some((type) => accept?.includes(type));

  if (!hasValidAccept) {
    throw new HTTPError({
      code: HTTP_NOT_ACCEPTABLE,
      body: {
        jsonrpc: '2.0',
        id: null,
        error: {
          code: MCP_ERROR_CODES.TOOL_ERROR,
          message: `Not Acceptable: Client must accept ${accepts.join(' or ')}`,
        },
      },
    });
  }
}
