import { removeByKeyInPlace, upsertByKey } from './resource-mutation';

import type { Prompt } from '@coremcp/protocol';

/**
 * adds a prompt to the collection
 * @param prompts current prompt array
 * @param prompt prompt to add or update
 * @returns updated prompt array
 */
export function addPrompt(prompts: Prompt[], prompt: Prompt): Prompt[] {
  return upsertByKey(prompts, prompt, (p) => p.name);
}

/**
 * drops a prompt from the collection by name, mutating the array in place
 * @param prompts current prompt array
 * @param name prompt name to drop
 * @returns true if an item was removed, false otherwise
 */
export function dropPrompt(prompts: Prompt[], name: string): boolean {
  return removeByKeyInPlace(prompts, name, (p) => p.name);
}
