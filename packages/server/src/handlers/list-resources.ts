import type {
  ListResourcesRequest,
  ListResourcesResult,
} from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to list available resources
 * @param params request parameters for listing resources
 * @param params.cursor optional cursor for pagination
 * @param context request context containing session and abort signal
 * @returns list of available resources with optional next cursor
 */
export async function handleListResources(
  params: ListResourcesRequest['params'],
  context: RequestContext,
): Promise<ListResourcesResult> {
  const { cursor } = { ...params };
  const { session } = context;

  const resources = cursor
    ? (() => {
        const cursorIndex = session.resources.findIndex(
          (resource) => resource.name === cursor,
        );

        return cursorIndex !== -1
          ? session.resources.slice(cursorIndex + 1)
          : [];
      })()
    : session.resources;

  return {
    resources,
  };
}
