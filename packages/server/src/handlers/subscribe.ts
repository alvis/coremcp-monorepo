import type { SubscribeRequest } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to subscribe to resource updates
 * @param params request parameters containing resource uri
 * @param params.uri resource uri to subscribe to
 * @param context request context containing session and abort signal
 * @param context.session current session context
 * @returns empty acknowledgement response
 */
export async function handleSubscribe(
  { uri }: SubscribeRequest['params'],
  { session }: RequestContext,
): Promise<Record<string, never>> {
  session.subscribeResource(uri);

  return {};
}
