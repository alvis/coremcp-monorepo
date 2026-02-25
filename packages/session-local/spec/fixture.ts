import type { SessionData } from '@coremcp/core';

/** shared test session data for consistent testing */
export const testSessionData: SessionData = {
  id: 'test-session-000000001',
  userId: 'user-1',
  protocolVersion: '1.0',
  clientInfo: { name: 'Test Client', version: '1.0' },
  serverInfo: { name: 'Test Server', version: '1.0' },
  capabilities: { client: {}, server: {} },
  tools: [],
  prompts: [],
  resources: [],
  resourceTemplates: [],
  subscriptions: [],
  events: [],
};

/** expired test session data for timeout testing */
export const expiredSessionData: SessionData = {
  ...testSessionData,
  id: 'expired-session-0000001',
  events: [
    {
      id: 'test-event-1',
      type: 'channel-started',
      channelId: 'test-channel',
      occurredAt: Date.now() - 5000,
    },
  ],
};

/** valid session data for corrupted file testing */
export const validSessionData: SessionData = {
  ...testSessionData,
  id: 'valid-session-000000002',
  userId: 'user-2',
  events: [
    {
      id: 'test-event-2',
      type: 'channel-started',
      channelId: 'test-channel',
      occurredAt: Date.now(),
    },
  ],
};

/** test directory path */
export const testStorePath = '/test/sessions';

/** test timestamp index directory path */
export const testTimestampIndexPath = '/test/sessions/.index/lastActivity';

/** mock stat object for directory */
export const mockStatDirectory = {
  isFile: () => false,
  isDirectory: () => true,
  isBlockDevice: () => false,
  isCharacterDevice: () => false,
  isSymbolicLink: () => false,
  isFIFO: () => false,
  isSocket: () => false,
  dev: 0,
  ino: 0,
  mode: 0,
  nlink: 0,
  uid: 0,
  gid: 0,
  rdev: 0,
  size: 0,
  blksize: 0,
  blocks: 0,
  atimeMs: 0,
  mtimeMs: 0,
  ctimeMs: 0,
  birthtimeMs: 0,
  atime: new Date(),
  mtime: new Date(),
  ctime: new Date(),
  birthtime: new Date(),
};
