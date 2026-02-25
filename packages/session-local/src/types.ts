import type { SessionStoreOptions } from '@coremcp/core';

/** configuration options for json file-based session storage */
export interface LocalSessionStoreOptions extends SessionStoreOptions {
  /** directory path for storing individual session json files */
  storeDirectory?: string;
}
