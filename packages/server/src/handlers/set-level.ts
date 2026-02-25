import type { SetLevelRequest } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to change server logging level
 * @param _params request parameters for setting log level
 * @param _params.level logging level to set
 * @param _context request context containing session and abort signal
 * @returns empty acknowledgement response
 */
export async function handleSetLevel(
  _params: SetLevelRequest['params'],
  _context: RequestContext,
): Promise<Record<string, never>> {
  return {};
}
