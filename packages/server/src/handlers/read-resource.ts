import type {
  ReadResourceRequest,
  ReadResourceResult,
} from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to read resource contents
 * @param params request parameters for reading resource
 * @param params.uri resource uri to read
 * @param _context request context containing session and abort signal
 * @returns resource contents as text or blob
 * @throws {Error} when resource is not found or not implemented
 */
export async function handleReadResource(
  params: ReadResourceRequest['params'],
  _context: RequestContext,
): Promise<ReadResourceResult> {
  // default implementation - should be overridden by custom implementation
  throw new Error(
    `Resource not found: ${params.uri}. Please check the resource URI and ensure it's available or registered with the server.`,
  );
}
