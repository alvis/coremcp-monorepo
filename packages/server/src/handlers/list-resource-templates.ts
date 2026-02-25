import type {
  ListResourceTemplatesRequest,
  ListResourceTemplatesResult,
} from '@coremcp/protocol';

import type { RequestContext } from '#types';

/**
 * handles requests to list resource templates
 * @param params request parameters for listing resource templates
 * @param params.cursor optional cursor for pagination
 * @param context request context containing session and abort signal
 * @returns list of resource templates with optional next cursor
 */
export async function handleListResourceTemplates(
  params: ListResourceTemplatesRequest['params'],
  context: RequestContext,
): Promise<ListResourceTemplatesResult> {
  const { cursor } = { ...params };
  const { session } = context;

  const resourceTemplates = cursor
    ? (() => {
        const cursorIndex = session.resourceTemplates.findIndex(
          (resource) => resource.name === cursor,
        );

        return cursorIndex !== -1
          ? session.resourceTemplates.slice(cursorIndex + 1)
          : [];
      })()
    : session.resourceTemplates;

  return {
    resourceTemplates,
  };
}
