import { removeByKeyInPlace, upsertByKey } from './resource-mutation';

import type { Resource, ResourceTemplate } from '@coremcp/protocol';

import type { SubscriptionHook } from './types';

/**
 * adds a resource
 * @param resources current resource array
 * @param resource resource to add or update
 * @returns updated resource array
 */
export function addResource(
  resources: Resource[],
  resource: Resource,
): Resource[] {
  return upsertByKey(resources, resource, (r) => r.uri);
}

/**
 * drops a resource
 * @param resources current resource array
 * @param uri resource URI to drop
 * @returns true if an item was removed, false otherwise
 */
export function dropResource(resources: Resource[], uri: string): boolean {
  return removeByKeyInPlace(resources, uri, (r) => r.uri);
}

/**
 * adds a resource template
 * @param templates current resource template array
 * @param template resource template to add or update
 * @returns updated resource template array
 */
export function addResourceTemplate(
  templates: ResourceTemplate[],
  template: ResourceTemplate,
): ResourceTemplate[] {
  return upsertByKey(templates, template, (rt) => rt.uriTemplate);
}

/**
 * drops a resource template
 * @param templates current resource template array
 * @param uriTemplate resource template URI template to drop
 * @returns true if an item was removed, false otherwise
 */
export function dropResourceTemplate(
  templates: ResourceTemplate[],
  uriTemplate: string,
): boolean {
  return removeByKeyInPlace(templates, uriTemplate, (rt) => rt.uriTemplate);
}

/**
 * subscribes to a resource URI
 * @param subscriptions set of subscribed URIs
 * @param uri resource URI to subscribe to
 * @param onSubscribe optional subscription hook
 */
export function subscribeResource(
  subscriptions: Set<string>,
  uri: string,
  onSubscribe?: SubscriptionHook,
): void {
  void onSubscribe?.(uri);
  subscriptions.add(uri);
}

/**
 * unsubscribes from a resource URI
 * @param subscriptions set of subscribed URIs
 * @param uri resource URI to unsubscribe from
 * @param onUnsubscribe optional unsubscription hook
 * @returns true if the URI was removed, false if it wasn't subscribed
 */
export function unsubscribeResource(
  subscriptions: Set<string>,
  uri: string,
  onUnsubscribe?: SubscriptionHook,
): boolean {
  void onUnsubscribe?.(uri);

  return subscriptions.delete(uri);
}
