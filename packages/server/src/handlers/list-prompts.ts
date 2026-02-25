import type { ListPromptsRequest, ListPromptsResult } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to list available prompts
 * @param params request parameters for listing prompts
 * @param params.cursor optional cursor for pagination
 * @param context request context containing session and abort signal
 * @returns list of available prompts with optional next cursor
 */
export async function handleListPrompts(
  params: ListPromptsRequest['params'],
  context: RequestContext,
): Promise<ListPromptsResult> {
  const { cursor } = { ...params };
  const { session } = context;

  const prompts = cursor
    ? (() => {
        const cursorIndex = session.prompts.findIndex(
          (prompt) => prompt.name === cursor,
        );

        return cursorIndex !== -1 ? session.prompts.slice(cursorIndex + 1) : [];
      })()
    : session.prompts;

  return {
    prompts,
  };
}
