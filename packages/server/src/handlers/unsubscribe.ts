import type { UnsubscribeRequest } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to unsubscribe from resource updates
 * @param _params request parameters containing resource uri
 * @param _params.uri resource uri to unsubscribe from
 * @param _context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export async function handleUnsubscribe(
  _params: UnsubscribeRequest['params'],
  _context: RequestContext,
): Promise<Record<string, never>> {
  // NOTE //
  // the mcp server already maintains a list of resource subscriptions
  // this handler only acts as a hook for the event for to unsubscribe a resource via an external API

  return {};
}
