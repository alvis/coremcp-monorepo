import { fetchAllPaginated } from '#connector/pagination';

import type {
  JsonRpcRequestEnvelope,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
  Resource,
  ResourceTemplate,
} from '@coremcp/protocol';

/** callback that sends a request and returns the response */
type SendRequest = <T>(
  request: Pick<JsonRpcRequestEnvelope, 'method' | 'params'>,
) => Promise<T>;

/**
 * reads the content of a specific resource by uri
 * @param sendRequest function to send a request to the server
 * @param uri unique identifier for the resource
 * @returns resource content and metadata
 */
export async function readResource(
  sendRequest: SendRequest,
  uri: string,
): Promise<ReadResourceResult> {
  return sendRequest<ReadResourceResult>({
    method: 'resources/read',
    params: { uri },
  });
}

/**
 * lists all resources available from the server
 * @param sendRequest function to send a request to the server
 * @returns array of all available resources
 */
export async function listResources(
  sendRequest: SendRequest,
): Promise<Resource[]> {
  return fetchAllPaginated<ListResourcesResult, Resource>(
    sendRequest,
    'resources/list',
    (result) => result.resources,
    (result) => result.nextCursor,
  );
}

/**
 * lists all resource templates available from the server
 * @param sendRequest function to send a request to the server
 * @returns array of all available resource templates
 */
export async function listResourceTemplates(
  sendRequest: SendRequest,
): Promise<ResourceTemplate[]> {
  return fetchAllPaginated<ListResourceTemplatesResult, ResourceTemplate>(
    sendRequest,
    'resources/templates/list',
    (result) => result.resourceTemplates,
    (result) => result.nextCursor,
  );
}

/**
 * subscribes to updates for a specific resource
 * @param sendRequest function to send a request to the server
 * @param uri unique identifier for the resource to subscribe to
 */
export async function subscribeToResource(
  sendRequest: SendRequest,
  uri: string,
): Promise<void> {
  await sendRequest<void>({
    method: 'resources/subscribe',
    params: { uri },
  });
}

/**
 * unsubscribes from resource updates
 * @param sendRequest function to send a request to the server
 * @param uri unique identifier for the resource to unsubscribe from
 */
export async function unsubscribeFromResource(
  sendRequest: SendRequest,
  uri: string,
): Promise<void> {
  await sendRequest<void>({
    method: 'resources/unsubscribe',
    params: { uri },
  });
}
