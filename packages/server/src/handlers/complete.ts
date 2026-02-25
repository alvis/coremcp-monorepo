import type { CompleteRequest, CompleteResult } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests for argument completion
 * @param _params request parameters for completion
 * @param _params.ref reference to prompt or resource template
 * @param _params.argument argument information for completion
 * @param _params.context optional additional completion context
 * @param _context request context containing session and abort signal
 * @returns completion results with suggested values
 */
export async function handleComplete(
  _params: CompleteRequest['params'],
  _context: RequestContext,
): Promise<CompleteResult> {
  // default implementation - should be overridden by server configuration
  return {
    completion: {
      values: [],
      total: 0,
    },
  };
}
