import type { JsonRpcRequestEnvelope } from '@coremcp/protocol';

/** callback that sends a request and returns the response */
type SendRequest = <T>(
  request: Pick<JsonRpcRequestEnvelope, 'method' | 'params'>,
) => Promise<T>;

/**
 * recursively fetches all paginated results using nextCursor
 * @param sendRequest function to send a request to the server
 * @param method the method to call for fetching results
 * @param extractItems function to extract items from the result
 * @param extractNextCursor function to extract next cursor from the result
 * @param cursor optional starting cursor
 * @returns promise resolving to all items across all pages
 */
export async function fetchAllPaginated<TResult, TItem>(
  sendRequest: SendRequest,
  method: `${string}/list`,
  extractItems: (result: TResult) => TItem[],
  extractNextCursor: (result: TResult) => string | undefined,
  cursor?: string,
): Promise<TItem[]> {
  const allItems: TItem[] = [];
  let currentCursor = cursor;

  do {
    const request = {
      method,
      params: { cursor: currentCursor },
    };

    const result = await sendRequest<TResult>(request);
    const items = extractItems(result);
    allItems.push(...items);
    currentCursor = extractNextCursor(result);
  } while (currentCursor);

  return allItems;
}
