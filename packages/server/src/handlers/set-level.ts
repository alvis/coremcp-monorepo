import type { SetLevelRequest } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to change server logging level
 * @param params request parameters for setting log level
 * @param params.level logging level to set
 * @param context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export async function handleSetLevel(
  params: SetLevelRequest['params'],
  context: RequestContext,
): Promise<Record<string, never>> {
  context.session.logLevel = params.level;

  return {};
}
