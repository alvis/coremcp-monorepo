/**
 * adds or updates an item in an array by a key getter
 * @param items array of items to upsert
 * @param item item to add or update
 * @param getKey function to get the key from an item
 * @returns new array with item added or updated
 */
export function upsertByKey<T>(
  items: T[],
  item: T,
  getKey: (item: T) => string,
): T[] {
  const key = getKey(item);
  const existingIndex = items.findIndex((i) => getKey(i) === key);
  if (existingIndex >= 0) {
    const updated = [...items];
    updated[existingIndex] = item;

    return updated;
  }

  return [...items, item];
}

/**
 * removes an item from an array by key and returns whether removal occurred
 * @param items array of items to modify
 * @param key key value to match for removal
 * @param getKey function to get the key from an item
 * @returns object with updated items array and whether an item was removed
 */
export function removeByKey<T>(
  items: T[],
  key: string,
  getKey: (item: T) => string,
): { items: T[]; removed: boolean } {
  const initialLength = items.length;
  const filtered = items.filter((item) => getKey(item) !== key);

  return { items: filtered, removed: filtered.length < initialLength };
}
