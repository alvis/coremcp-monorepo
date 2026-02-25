import type { ListToolsRequest, ListToolsResult } from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to list available tools
 * @param params request parameters for listing tools
 * @param params.cursor optional cursor for pagination
 * @param context request context containing session and abort signal
 * @returns list of available tools with optional next cursor
 */
export async function handleListTools(
  params: ListToolsRequest['params'],
  context: RequestContext,
): Promise<ListToolsResult> {
  const { cursor } = { ...params };
  const { session } = context;

  const tools = cursor
    ? (() => {
        const cursorIndex = session.tools.findIndex(
          (tool) => tool.name === cursor,
        );

        return cursorIndex !== -1 ? session.tools.slice(cursorIndex + 1) : [];
      })()
    : session.tools;

  return {
    tools,
  };
}
