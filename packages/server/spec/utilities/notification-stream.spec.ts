import { Session } from '@coremcp/core';
import { JSONRPC_VERSION } from '@coremcp/protocol';

import { describe, expect, it, vi } from 'vitest';

import { streamSessionNotifications } from '#utilities/notification-stream';

import type { SessionContext, SessionData, SessionStore } from '@coremcp/core';
import type { JsonRpcMessage } from '@coremcp/protocol';

import type { ConnectionContext } from '#types';

// CONSTANTS //

const sessionData: SessionData = {
  id: 'test-session',
  userId: null,
  clientInfo: { name: 'test-client', version: '1.0.0' },
  serverInfo: { name: 'test-server', version: '1.0.0' },
  protocolVersion: '2025-06-18',
  capabilities: { client: {}, server: {} },
  tools: [],
  prompts: [],
  resources: [],
  resourceTemplates: [],
  subscriptions: [],
  events: [],
};

const sessionContext: SessionContext = {};

const notificationMessage: JsonRpcMessage = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/tools/list_changed',
} as JsonRpcMessage;

const responseMessage: JsonRpcMessage = {
  jsonrpc: JSONRPC_VERSION,
  id: 'req-1',
  result: { tools: [] },
} as JsonRpcMessage;

// HELPERS //

const createTestSession = (): Session =>
  new Session(sessionData, sessionContext);

const createTestContext = (
  overrides: Partial<ConnectionContext> = {},
): ConnectionContext => ({
  channelId: 'test-channel',
  sessionId: 'test-session',
  transport: 'sse',
  abortSignal: new AbortController().signal,
  waitUntilClosed: new Promise(() => {}),
  write: vi.fn(async () => {}),
  ...overrides,
});

// MOCKS //

vi.useFakeTimers();

// TEST SUITES //

describe('fn:streamSessionNotifications', () => {
  it('should forward server-message events without responseToRequestId to context.write', async () => {
    const session = createTestSession();
    const context = createTestContext();

    streamSessionNotifications({ session, context });

    await session.addEvent({
      type: 'server-message',
      message: notificationMessage,
    });

    expect(context.write).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'notifications/tools/list_changed',
      }),
    );
  });

  it('should not forward events with responseToRequestId', async () => {
    const session = createTestSession();
    const context = createTestContext();

    streamSessionNotifications({ session, context });

    await session.addEvent({
      type: 'server-message',
      responseToRequestId: 'req-1',
      message: responseMessage,
    });

    expect(context.write).not.toHaveBeenCalled();
  });

  it('should not forward non-server-message events', async () => {
    const session = createTestSession();
    const context = createTestContext();

    streamSessionNotifications({ session, context });

    await session.addEvent({ type: 'channel-started' });

    expect(context.write).not.toHaveBeenCalled();
  });

  it('should set up polling interval for non-push stores', () => {
    const session = createTestSession();
    const context = createTestContext();
    const syncSpy = vi.spyOn(session, 'sync').mockResolvedValue([]);

    const nonPushStore = {
      capabilities: { push: false },
      get: vi.fn(),
      set: vi.fn(),
      drop: vi.fn(),
      pullEvents: vi.fn(),
      pushEvents: vi.fn(),
      subscribe: vi.fn(),
    } satisfies Partial<SessionStore> as Partial<SessionStore> as SessionStore;

    streamSessionNotifications({
      session,
      context,
      sessionStorage: nonPushStore,
    });

    vi.advanceTimersByTime(1000);

    expect(syncSpy).toHaveBeenCalled();
  });

  it('should not set up polling for push stores', () => {
    const session = createTestSession();
    const context = createTestContext();
    const syncSpy = vi.spyOn(session, 'sync').mockResolvedValue([]);

    const pushStore = {
      capabilities: { push: true },
      get: vi.fn(),
      set: vi.fn(),
      drop: vi.fn(),
      pullEvents: vi.fn(),
      pushEvents: vi.fn(),
      subscribe: vi.fn(),
    } satisfies Partial<SessionStore> as Partial<SessionStore> as SessionStore;

    streamSessionNotifications({
      session,
      context,
      sessionStorage: pushStore,
    });

    vi.advanceTimersByTime(5000);

    expect(syncSpy).not.toHaveBeenCalled();
  });

  it('should unsubscribe and clear interval on cleanup', () => {
    const session = createTestSession();
    const context = createTestContext();
    vi.spyOn(session, 'sync').mockResolvedValue([]);

    const nonPushStore = {
      capabilities: { push: false },
      get: vi.fn(),
      set: vi.fn(),
      drop: vi.fn(),
      pullEvents: vi.fn(),
      pushEvents: vi.fn(),
      subscribe: vi.fn(),
    } satisfies Partial<SessionStore> as Partial<SessionStore> as SessionStore;

    const cleanup = streamSessionNotifications({
      session,
      context,
      sessionStorage: nonPushStore,
    });

    cleanup();

    // after cleanup, adding events should not trigger context.write
    void session.addEvent({
      type: 'server-message',
      message: notificationMessage,
    });

    // the write from the listener should not fire after cleanup
    // (only the sync call via addEvent's internal flow, not from our listener)
    expect(context.write).not.toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'notifications/tools/list_changed',
      }),
    );
  });
});
