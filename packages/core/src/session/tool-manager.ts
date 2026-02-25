import { removeByKeyInPlace, upsertByKey } from './resource-mutation';

import type { Tool } from '@coremcp/protocol';

/**
 * adds a tool to the collection
 * @param tools current tool array
 * @param tool tool to add or update
 * @returns updated tool array
 */
export function addTool(tools: Tool[], tool: Tool): Tool[] {
  return upsertByKey(tools, tool, (t) => t.name);
}

/**
 * drops a tool from the collection by name, mutating the array in place
 * @param tools current tool array
 * @param name tool name to drop
 * @returns true if an item was removed, false otherwise
 */
export function dropTool(tools: Tool[], name: string): boolean {
  return removeByKeyInPlace(tools, name, (t) => t.name);
}
