import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import type { CallToolRequest, CallToolResult } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to invoke a specific tool
 * @param params request parameters for tool invocation
 * @param params.name name of the tool to invoke
 * @param params.arguments optional arguments to pass to the tool
 * @param _context request context containing session and abort signal
 * @returns tool execution result with content and error status
 * @throws {JsonRpcError} when tool is not found or not implemented
 */
export async function handleCallTool(
  params: CallToolRequest['params'],
  _context: RequestContext,
): Promise<CallToolResult> {
  // default implementation - should be overridden by server configuration
  throw new JsonRpcError({
    code: MCP_ERROR_CODES.INVALID_PARAMS,
    message: `Tool not found: ${params.name}. Please check the tool name and ensure it's registered with the server.`,
  });
}
