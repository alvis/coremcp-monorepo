import { MCP_ERROR_CODES } from '@coremcp/protocol';

import {
  HTTP_BAD_REQUEST,
  HTTP_NOT_FOUND,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_UNAUTHORIZED,
  HTTP_FORBIDDEN,
  HTTP_TOO_MANY_REQUESTS,
} from './http';

/** MCP error code to HTTP status code mapping */
export const MCP_ERROR_TO_HTTP_STATUS = {
  /** parse error - malformed JSON */
  [MCP_ERROR_CODES.PARSE_ERROR]: HTTP_BAD_REQUEST,

  /** invalid request - malformed request structure */
  [MCP_ERROR_CODES.INVALID_REQUEST]: HTTP_BAD_REQUEST,

  /** method not found - unknown method */
  [MCP_ERROR_CODES.METHOD_NOT_FOUND]: HTTP_NOT_FOUND,

  /** invalid params - invalid method parameters */
  [MCP_ERROR_CODES.INVALID_PARAMS]: HTTP_BAD_REQUEST,

  /** internal error - server-side error */
  [MCP_ERROR_CODES.INTERNAL_ERROR]: HTTP_INTERNAL_SERVER_ERROR,

  /** tool error - tool execution failed */
  [MCP_ERROR_CODES.TOOL_ERROR]: HTTP_INTERNAL_SERVER_ERROR,

  /** resource not found */
  [MCP_ERROR_CODES.RESOURCE_NOT_FOUND]: HTTP_NOT_FOUND,

  /** authentication required */
  [MCP_ERROR_CODES.AUTHENTICATION_REQUIRED]: HTTP_UNAUTHORIZED,

  /** authorization failed - insufficient permissions */
  [MCP_ERROR_CODES.AUTHORIZATION_FAILED]: HTTP_FORBIDDEN,

  /** session invalid - session expired or invalid */
  [MCP_ERROR_CODES.SESSION_INVALID]: HTTP_UNAUTHORIZED,

  /** rate limited - too many requests */
  [MCP_ERROR_CODES.RATE_LIMITED]: HTTP_TOO_MANY_REQUESTS,
} as const;
