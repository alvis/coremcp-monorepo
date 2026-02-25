import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import type { GetPromptRequest, GetPromptResult } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to retrieve a specific prompt
 * @param params request parameters for prompt retrieval
 * @param params.name name of the prompt to retrieve
 * @param params.arguments optional arguments for prompt templating
 * @param _context request context containing session and abort signal
 * @returns prompt with resolved message content
 * @throws {Error} when prompt is not found or not implemented
 */
export async function handleGetPrompt(
  params: GetPromptRequest['params'],
  _context: RequestContext,
): Promise<GetPromptResult> {
  // default implementation - should be overridden by server configuration
  throw new JsonRpcError({
    code: MCP_ERROR_CODES.INVALID_PARAMS,
    message: `Prompt not found: ${params.name}. Please check the prompt name and ensure it's registered with the server.`,
  });
}
