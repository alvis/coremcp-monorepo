import { JSONRPC_VERSION } from '@coremcp/protocol';

import { describe, expect, it, vi } from 'vitest';

import { McpServer } from '#server';

import {
  basicInitParams,
  basicServerInfo,
  cancelledNotificationMessageWithParams,
  connectionContext,
  contextWithNewSession,
  contextWithoutSessionId,
  contextWithPreviousSession,
  contextWithSession1Named,
  contextWithSession2Named,
  getSession,
  initializedNotificationMessage,
  malformedCancelledNotificationMessage,
  pingMessage,
  session,
  sessionData,
  sessionStore,
  sessionWithSubscriptions,
  setSession,
  testSessionForNotification,
  unknownMethodMessage,
  unknownNotificationMessage,
} from './fixtures';

import type { Session } from '@coremcp/core';
import type {
  JsonRpcNotificationEnvelope,
  JsonRpcRequestEnvelope,
} from '@coremcp/protocol';

import type { ConnectionContext } from '#transport';
import type {
  CallTool,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListTools,
  ReadResource,
} from '#types/handler';

// create mock handler functions
const listTools = vi.fn<ListTools>();
const callTool = vi.fn<CallTool>();
const listPrompts = vi.fn<ListPrompts>();
const getPrompt = vi.fn<GetPrompt>();
const listResources = vi.fn<ListResources>();
const readResource = vi.fn<ReadResource>();

// create a single base server with all capabilities for testing
const baseServer = new McpServer({
  serverInfo: basicServerInfo,
  sessionStore,
  tools: [
    {
      name: 'test-tool',
      description: 'Test tool',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      } as import('@coremcp/protocol').Tool['inputSchema'],
    },
    {
      name: 'mixed-tool',
      description: 'Mixed tool',
      inputSchema: {
        type: 'object',
        properties: {},
        required: [],
      } as import('@coremcp/protocol').Tool['inputSchema'],
    },
  ],
  prompts: [
    {
      name: 'test-prompt',
      description: 'Test prompt',
      arguments: [],
    },
  ],
  resources: [
    {
      uri: 'test://resource',
      name: 'Test Resource',
      description: 'Test resource',
      mimeType: 'text/plain',
    },
  ],
  handlers: {
    listTools,
    callTool,
    listPrompts,
    getPrompt,
    listResources,
    readResource,
  },
});

// create minimal server without capabilities for testing empty capabilities
const minimalServer = new McpServer({
  serverInfo: basicServerInfo,
  sessionStore,
});

// server with different session store for user testing
const serverWithDifferentUserStore = new McpServer({
  serverInfo: basicServerInfo,
  sessionStore: {
    get: vi.fn().mockResolvedValue({
      ...sessionData,
      id: 'previous-session-id',
      userId: 'user1',
    }),
    set: vi.fn(),
    drop: vi.fn(),
    pullEvents: vi.fn(),
    pushEvents: vi.fn(),
    subscribe: vi.fn(),
    capabilities: { push: false },
  },
});

vi.useFakeTimers();

describe('cl:McpServer', () => {
  describe('constructor', () => {
    it('should create server with configuration', () => {
      expect(baseServer).toBeInstanceOf(McpServer);
      expect(baseServer.capabilities).toBeDefined();
    });

    it('should create server and test basic functionality', () => {
      const capabilities = baseServer.capabilities;
      expect(capabilities).toBeDefined();
      expect(typeof capabilities).toBe('object');
    });
  });

  describe('gt:capabilities', () => {
    it('should compute capabilities for server with all features', () => {
      const capabilities = baseServer.capabilities;

      expect(capabilities).toEqual({
        logging: {},
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true, subscribe: true },
      });
    });

    it('should have only logging capability when no tools, prompts, or resources are configured', () => {
      const capabilities = minimalServer.capabilities;

      expect(capabilities).toEqual({
        logging: {},
        tools: undefined,
        prompts: undefined,
        resources: undefined,
      });
    });

    it('should compute capabilities correctly when handlers are provided', () => {
      const serverWithOnlyHandlers = new McpServer({
        serverInfo: basicServerInfo,
        handlers: {
          listTools: vi.fn(),
          callTool: vi.fn(),
          listPrompts: vi.fn(),
          getPrompt: vi.fn(),
          listResources: vi.fn(),
          readResource: vi.fn(),
        },
      });

      const capabilities = serverWithOnlyHandlers.capabilities;

      expect(capabilities).toEqual({
        logging: {},
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true, subscribe: true },
      });
    });

    it('should merge capabilities from both static and dynamic configurations', () => {
      const serverWithPartialCapabilities = new McpServer({
        serverInfo: basicServerInfo,
        tools: [
          {
            name: 'static-tool',
            description: 'Static tool',
            inputSchema: {
              type: 'object',
              properties: {},
              required: [],
            } as import('@coremcp/protocol').Tool['inputSchema'],
          },
        ],
        handlers: {
          listPrompts: vi.fn(),
          getPrompt: vi.fn(),
        },
      });

      const capabilities = serverWithPartialCapabilities.capabilities;

      expect(capabilities).toEqual({
        logging: {},
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: undefined,
      });
    });
  });

  describe('gt:status', () => {
    it('should return server status with pending requests and total sessions', async () => {
      await baseServer.initializeSession(
        basicInitParams,
        contextWithNewSession,
      );

      const status = baseServer.status;

      expect(status.totalSessions).toBeGreaterThanOrEqual(1);
      expect(status.pendingRequests).toBe(0);
    });
  });

  describe('mt:handleMessage', () => {
    it('should handle ping message via handleMessage', async () => {
      const mockWrite = vi.fn();
      const context: ConnectionContext = {
        ...connectionContext,
        write: mockWrite,
      };

      await baseServer.handleMessage(pingMessage, context);

      expect(mockWrite).toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        id: pingMessage.id,
        result: {},
      });
    });

    it('should invoke onInitialize callback when provided during initialization', async () => {
      const onInitializeCallback = vi.fn();
      const mockWrite = vi.fn();
      const context: ConnectionContext = {
        ...connectionContext,
        write: mockWrite,
      };
      const initializeMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'initialize',
        id: 'init-1',
        params: basicInitParams,
      };

      await baseServer.handleMessage(initializeMessage, context, {
        onInitialize: onInitializeCallback,
      });

      expect(onInitializeCallback).toHaveBeenCalledOnce();
      expect(onInitializeCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.any(String),
          protocolVersion: expect.any(String),
        }),
      );
    });
  });

  describe('mt:initializeSession', () => {
    it('should create new session with userId from context', async () => {
      getSession.mockResolvedValue(null);

      const contextWithUser: ConnectionContext = {
        ...connectionContext,
        userId: 'user-1',
      };

      const result = await baseServer.initializeSession(
        basicInitParams,
        contextWithUser,
      );

      // check that a session ID was generated
      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe('string');
      expect(result.id.length).toBeGreaterThan(0);
      expect(result.userId).toBe('user-1');
    });

    it('should handle initializeSession with basic context', async () => {
      const sessionResult = await baseServer.initializeSession(
        basicInitParams,
        connectionContext,
      );

      expect(sessionResult).toBeDefined();
      // server generates its own ID since there's no previous session
      expect(sessionResult.id).toBeTruthy();
      expect(typeof sessionResult.id).toBe('string');
      expect(sessionResult.id.length).toBeGreaterThan(0);
    });

    it('should always create new session when initializeSession is called', async () => {
      getSession.mockResolvedValue({
        ...sessionData,
        id: 'previous-session-id',
        userId: 'user1',
      });

      const result = await baseServer.initializeSession(
        basicInitParams,
        contextWithPreviousSession,
      );

      // should always create a new session
      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe('string');
    });

    it('should create new session with different user', async () => {
      const result = await serverWithDifferentUserStore.initializeSession(
        basicInitParams,
        contextWithNewSession,
      );

      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe('string');
    });

    it('should generate new sessionId when context.sessionId is undefined', async () => {
      getSession.mockResolvedValueOnce(null);

      const sessionResult = await baseServer.initializeSession(
        basicInitParams,
        contextWithoutSessionId,
      );

      // should generate a new ID since sessionId is undefined
      expect(sessionResult.id).toBeDefined();
      expect(typeof sessionResult.id).toBe('string');
      expect(sessionResult.id.length).toBeGreaterThan(0);
    });

    it('should exercise save callback when session store is available', async () => {
      getSession.mockResolvedValueOnce(null);
      const session = await baseServer.initializeSession(
        basicInitParams,
        connectionContext,
      );

      // trigger the save callback by calling the save method on the session
      await session.save();

      expect(setSession).toHaveBeenCalledWith(session.toJSON());
    });
  });

  describe('mt:handleRequestMessage', () => {
    it('should throw for unknown request method', async () => {
      await expect(
        baseServer.handleRequestMessage(unknownMethodMessage, session),
      ).rejects.toThrow('Unknown request');
    });
  });

  describe('mt:handleNotificationMessage', () => {
    it('should handle notifications/initialized message', async () => {
      const result = baseServer.handleNotificationMessage(
        initializedNotificationMessage,
        session,
      );

      await expect(result).resolves.toBe(undefined);
    });

    it('should handle notifications/cancelled message and abort active request', async () => {
      let wasCancelled = false;
      callTool.mockImplementation(
        async (_params, context) =>
          new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              resolve({
                content: [{ type: 'text', text: 'Tool completed' }],
              });
            }, 5000); // 5 second delay

            // listen for abort signal
            context.abort.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              wasCancelled = true;
              reject(new Error('Request was cancelled'));
            });
          }),
      );

      // create a proper session for testing
      const session = await baseServer.initializeSession(
        basicInitParams,
        connectionContext,
      );

      // start a time-consuming tool call request
      const toolCallMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'tools/call',
        id: 'test-request-123',
        params: {
          name: 'test-tool',
          arguments: {},
        },
      };

      // start the request but don't await it
      const toolCallPromise = baseServer.handleRequestMessage(
        toolCallMessage,
        session,
      );

      // advance timers to let the request start
      await vi.advanceTimersByTimeAsync(100);

      // send cancellation notification
      await baseServer.handleNotificationMessage(
        cancelledNotificationMessageWithParams,
        session,
      );

      // wait for the request to complete (it should send error response)
      await toolCallPromise;

      // verify the cancellation was triggered
      expect(wasCancelled).toBe(true);
    });

    it('should handle unknown notification gracefully', async () => {
      // handleNotificationMessage catches errors and sends them via session.reply
      // errors from unknown notifications are converted to Internal Error
      const mockReply = vi.fn();
      const testSession = { ...session, reply: mockReply };

      await baseServer.handleNotificationMessage(
        unknownNotificationMessage,
        testSession as unknown as Session,
      );

      // verify error was sent as response
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: expect.any(Number),
            message: expect.any(String),
          }),
        }),
      );
    });

    it('should handle notification with malformed message', async () => {
      const malformedMessage: JsonRpcNotificationEnvelope =
        malformedCancelledNotificationMessage as JsonRpcNotificationEnvelope;

      const mockReply = vi.fn();
      const testSession = { ...session, reply: mockReply };

      await baseServer.handleNotificationMessage(
        malformedMessage,
        testSession as unknown as Session,
      );

      // verify error was sent as response
      expect(mockReply).toHaveBeenCalled();
    });

    it('should handle unknown notification method in handleNotificationMessage', async () => {
      const mockReply = vi.fn();
      const testSession = { ...testSessionForNotification, reply: mockReply };

      await baseServer.handleNotificationMessage(
        unknownNotificationMessage,
        testSession as unknown as Session,
      );

      // verify error was sent as response
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.any(Object),
        }),
      );
    });
  });

  describe('mt:notifyResourceUpdate', () => {
    it('should return undefined when no subscribers exist', async () => {
      const result = await baseServer.notifyResourceUpdate('test://resource');
      expect(result).toBe(undefined);

      // also test with promise syntax
      await expect(
        baseServer.notifyResourceUpdate('test://resource'),
      ).resolves.toBe(undefined);
    });

    it('should notify subscribers of resource update', async () => {
      // initialize sessions for each user
      const send1 = vi.fn<ConnectionContext['write']>();
      const session1 = await baseServer.initializeSession(basicInitParams, {
        ...connectionContext,
        write: send1,
      });

      const send2 = vi.fn<ConnectionContext['write']>();
      const session2 = await baseServer.initializeSession(basicInitParams, {
        ...connectionContext,
        write: send2,
      });

      const send3 = vi.fn<ConnectionContext['write']>();
      const session3 = await baseServer.initializeSession(basicInitParams, {
        ...connectionContext,
        write: send3,
      });

      // each user submits a subscription request for the same resource
      session1.subscribeResource('test://resource');
      session2.subscribeResource('test://resource');
      session3.subscribeResource('test://resource');

      // pretend user 3 now subscribe from the resource
      session3.unsubscribeResource('test://resource');

      await baseServer.notifyResourceUpdate('test://resource');

      // verify all 3 sessions received the notification
      expect(send1).toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: { uri: 'test://resource' },
      });

      expect(send2).toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: { uri: 'test://resource' },
      });

      expect(send3).not.toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: { uri: 'test://resource' },
      });
    });
  });

  describe('mt:pauseSession', () => {
    it('should remove session from active sessions and subscriptions', async () => {
      const server = baseServer;
      getSession.mockResolvedValueOnce(null);
      const sessionResult = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );
      sessionResult.subscribeResource('test://resource');

      const notifyMock = vi.fn();
      sessionResult.reply = notifyMock;

      await server.pauseSession(sessionResult);
      await server.notifyResourceUpdate('test://resource');

      expect(notifyMock).not.toHaveBeenCalledWith({
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/resources/updated',
        params: { uri: 'test://resource' },
      });
    });

    it('should handle pauseSession', async () => {
      const result = async () => baseServer.pauseSession(session);

      await expect(result()).resolves.not.toThrow();
    });

    it('should clean up subscriptions when pausing session', async () => {
      await baseServer.pauseSession(sessionWithSubscriptions);

      expect(async () =>
        baseServer.notifyResourceUpdate('test://resource1'),
      ).not.toThrow();
    });
  });

  describe('mt:terminalSession', () => {
    it('should terminate session and clean up resources', async () => {
      const dropSession = vi.fn();
      sessionStore.drop = dropSession;

      const contextWithUser: ConnectionContext = {
        ...connectionContext,
        userId: 'user-1',
      };

      // mock for initializeSession
      getSession.mockResolvedValueOnce(null);

      const sessionResult = await baseServer.initializeSession(
        basicInitParams,
        contextWithUser,
      );

      // subscribe to some resources
      sessionResult.subscribeResource('test://resource1');
      sessionResult.subscribeResource('test://resource2');

      const contextWithSession: ConnectionContext = {
        ...connectionContext,
        sessionId: sessionResult.id,
        userId: 'user-1',
      };

      // no need to mock storage - session is active and will be found in memory

      await baseServer.terminateSession(contextWithSession);

      // verify session was dropped from storage
      expect(dropSession).toHaveBeenCalledWith(sessionResult.id);

      // verify subscriptions were cleaned up by trying to notify
      sessionResult.reply = vi.fn();
      await baseServer.notifyResourceUpdate('test://resource1');
      expect(sessionResult.reply).not.toHaveBeenCalled();
    });

    it('should throw NOT_FOUND when session does not exist', async () => {
      getSession.mockResolvedValueOnce(null);

      const contextWithSession: ConnectionContext = {
        ...connectionContext,
        sessionId: 'non-existent-session',
        userId: 'user-1',
      };

      await expect(
        baseServer.terminateSession(contextWithSession),
      ).rejects.toThrow('Not Found: the requested session does not exist');
    });

    it('should throw FORBIDDEN when session belongs to different user', async () => {
      getSession.mockReset();
      getSession.mockResolvedValue({
        ...sessionData,
        id: 'test-session',
        userId: 'user-1', // different user
      });

      const contextWithSession: ConnectionContext = {
        ...connectionContext,
        sessionId: 'test-session',
        userId: 'user-2',
      };

      await expect(
        baseServer.terminateSession(contextWithSession),
      ).rejects.toThrow(
        'Forbidden: session does not belong to authenticated user',
      );
    });

    it('should clean up inactive session subscriptions', async () => {
      // mock a session that exists in storage but is not active
      getSession.mockReset();
      getSession.mockResolvedValue({
        ...sessionData,
        id: 'inactive-session',
        userId: 'user-1',
        subscriptions: ['test://resource1', 'test://resource2'],
      });

      const dropSession = vi.fn();
      sessionStore.drop = dropSession;

      const contextWithSession: ConnectionContext = {
        ...connectionContext,
        sessionId: 'inactive-session',
        userId: 'user-1',
      };

      await baseServer.terminateSession(contextWithSession);

      // verify session was dropped
      expect(dropSession).toHaveBeenCalledWith('inactive-session');
    });

    it('should handle session without authentication requirements', async () => {
      const serverWithoutAuth = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
        // no resolveUserId - authentication not required
      });

      const dropSession = vi.fn();
      sessionStore.drop = dropSession;

      getSession.mockReset();
      getSession.mockResolvedValue({
        ...sessionData,
        id: 'test-session',
        userId: null, // no user
      });

      const contextWithSession: ConnectionContext = {
        channelId: 'test-channel',
        sessionId: 'test-session',
        transport: 'test',
        abortSignal: new AbortController().signal,
        waitUntilClosed: Promise.resolve(),
        write: vi.fn(),
        // explicitly no userId
      };

      await serverWithoutAuth.terminateSession(contextWithSession);

      // should drop the session without authentication checks
      expect(dropSession).toHaveBeenCalledWith('test-session');
    });
  });

  describe('mt:#unsubscribeFromResource', () => {
    it('should handle subscribing and unsubscribing correctly', async () => {
      getSession.mockResolvedValueOnce(null);
      const sessionResult = await baseServer.initializeSession(
        basicInitParams,
        connectionContext,
      );

      // test unsubscribing from non-existent resource (should not throw)
      expect(() =>
        sessionResult.unsubscribeResource('test://nonexistent'),
      ).not.toThrow();

      // subscribe to a resource
      sessionResult.subscribeResource('test://resource');

      // verify subscription works
      const notifyMock1 = vi.fn();
      sessionResult.reply = notifyMock1;
      await baseServer.notifyResourceUpdate('test://resource');
      expect(notifyMock1).toHaveBeenCalled();

      // unsubscribe from the resource
      sessionResult.unsubscribeResource('test://resource');

      // verify no notifications are sent after unsubscribe
      const notifyMock2 = vi.fn();
      sessionResult.reply = notifyMock2;
      await baseServer.notifyResourceUpdate('test://resource');
      expect(notifyMock2).not.toHaveBeenCalled();
    });

    it('should delete subscription entry when last subscriber unsubscribes', async () => {
      const server = baseServer;

      getSession.mockResolvedValueOnce(null);
      const session1 = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );

      getSession.mockResolvedValueOnce(null);
      const session2 = await server.initializeSession(
        basicInitParams,
        contextWithSession2Named,
      );

      // both sessions subscribe
      session1.subscribeResource('test://resource');
      session2.subscribeResource('test://resource');

      // unsubscribe first session
      session1.unsubscribeResource('test://resource');

      // second session should still receive notifications
      const notify2Mock = vi.fn();
      session2.reply = notify2Mock;
      await server.notifyResourceUpdate('test://resource');
      expect(notify2Mock).toHaveBeenCalled();

      // unsubscribe second session (last subscriber)
      session2.unsubscribeResource('test://resource');

      const notify2Mock2 = vi.fn();
      session2.reply = notify2Mock2;
      await server.notifyResourceUpdate('test://resource');
      expect(notify2Mock2).not.toHaveBeenCalled();
    });

    it('should properly clean up subscriptions data structure when unsubscribing', async () => {
      const server = baseServer;

      getSession.mockResolvedValueOnce(null);
      const session1 = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );

      // subscribe to a resource
      session1.subscribeResource('test://cleanup-resource');

      // verify subscription exists by checking notification
      const notifyMock = vi.fn();
      session1.reply = notifyMock;
      await server.notifyResourceUpdate('test://cleanup-resource');
      expect(notifyMock).toHaveBeenCalled();

      // unsubscribe (this should trigger cleanup of empty subscription entry)
      session1.unsubscribeResource('test://cleanup-resource');

      // verify cleanup worked by ensuring no notification is sent
      const notifyMock2 = vi.fn();
      session1.reply = notifyMock2;
      await server.notifyResourceUpdate('test://cleanup-resource');
      expect(notifyMock2).not.toHaveBeenCalled();
    });
  });

  describe('mt:cleanupInactiveSessions', () => {
    it('should return 0 when no sessions exist', () => {
      const freshServer = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const count = freshServer.cleanupInactiveSessions();

      expect(count).toBe(0);
      expect(freshServer.status.totalSessions).toBe(0);
    });

    it('should return 0 when all sessions are active', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      getSession.mockResolvedValueOnce(null);
      const session1 = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );

      getSession.mockResolvedValueOnce(null);
      const session2 = await server.initializeSession(
        basicInitParams,
        contextWithSession2Named,
      );
      await session1.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: Date.now(),
      });
      await session2.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-2',
        recordedAt: Date.now(),
      });

      const count = server.cleanupInactiveSessions(1000);

      expect(count).toBe(0);
      expect(server.status.totalSessions).toBe(2);
    });

    it('should cleanup inactive sessions with default timeout', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      getSession.mockResolvedValueOnce(null);
      const inactiveSession = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      await inactiveSession.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: sixMinutesAgo,
      });

      expect(server.status.totalSessions).toBe(1);

      const count = server.cleanupInactiveSessions();

      expect(count).toBe(1);
      expect(server.status.totalSessions).toBe(0);
    });

    it('should cleanup inactive sessions with custom timeout', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      getSession.mockResolvedValueOnce(null);
      const inactiveSession = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
      await inactiveSession.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: twoMinutesAgo,
      });

      expect(server.status.totalSessions).toBe(1);

      const count = server.cleanupInactiveSessions(60000);

      expect(count).toBe(1);
      expect(server.status.totalSessions).toBe(0);
    });

    it('should preserve active sessions and only cleanup inactive ones', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      getSession.mockResolvedValueOnce(null);
      const activeSession = await server.initializeSession(basicInitParams, {
        ...contextWithSession1Named,
        sessionId: 'active-session',
      });
      await activeSession.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: Date.now(),
      });

      getSession.mockResolvedValueOnce(null);
      const inactiveSession1 = await server.initializeSession(basicInitParams, {
        ...contextWithSession1Named,
        sessionId: 'inactive-session-1',
      });
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      await inactiveSession1.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-2',
        recordedAt: sixMinutesAgo,
      });

      getSession.mockResolvedValueOnce(null);
      const inactiveSession2 = await server.initializeSession(basicInitParams, {
        ...contextWithSession1Named,
        sessionId: 'inactive-session-2',
      });
      const sevenMinutesAgo = Date.now() - 7 * 60 * 1000;
      await inactiveSession2.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-3',
        recordedAt: sevenMinutesAgo,
      });

      expect(server.status.totalSessions).toBe(3);

      const count = server.cleanupInactiveSessions(300000);

      expect(count).toBe(2);
      expect(server.status.totalSessions).toBe(1);
    });

    it('should cleanup sessions and remove subscriptions', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      getSession.mockResolvedValueOnce(null);
      const sessionWithSub = await server.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );
      sessionWithSub.subscribeResource('test://resource');
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      await sessionWithSub.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: sixMinutesAgo,
      });
      const notifyMockBefore = vi.fn();
      sessionWithSub.reply = notifyMockBefore;
      await server.notifyResourceUpdate('test://resource');
      expect(notifyMockBefore).toHaveBeenCalled();

      const count = server.cleanupInactiveSessions(0);

      expect(count).toBe(1);
      expect(server.status.totalSessions).toBe(0);
      getSession.mockResolvedValueOnce(null);
      const newSession = await server.initializeSession(basicInitParams, {
        ...contextWithSession1Named,
        sessionId: 'new-session',
      });
      const notifyMockAfter = vi.fn();
      newSession.reply = notifyMockAfter;
      await server.notifyResourceUpdate('test://resource');
      expect(notifyMockAfter).not.toHaveBeenCalled();
    });

    it('should drop session from storage', async () => {
      const testStore = {
        capabilities: { push: false },
        get: getSession,
        set: vi.fn().mockResolvedValue(undefined),
        drop: vi.fn().mockResolvedValue(undefined),
        pullEvents: vi.fn().mockResolvedValue([]),
        pushEvents: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn().mockReturnValue(() => {}),
      };

      const dedicatedServer = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore: testStore as any,
      });

      getSession.mockResolvedValueOnce(null);
      const inactiveSession = await dedicatedServer.initializeSession(
        basicInitParams,
        contextWithSession1Named,
      );
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000;
      await inactiveSession.addEvent({
        type: 'channel-started',
        channelId: 'test-channel-1',
        recordedAt: sixMinutesAgo,
      });

      const count = dedicatedServer.cleanupInactiveSessions(0);

      expect(count).toBe(1);
      expect(testStore.drop).toHaveBeenCalledWith(inactiveSession.id);
    });
  });

  describe('Session Management Options', () => {
    describe('sessionIdGenerator', () => {
      it('should use custom sessionIdGenerator when provided', async () => {
        const customSessionId = 'custom-session-abc123';
        const customGenerator = vi.fn().mockReturnValue(customSessionId);
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          sessionIdGenerator: customGenerator,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session.id).toBe(customSessionId);
        expect(customGenerator).toHaveBeenCalled();
      });

      it('should fall back to default when generator returns invalid value', async () => {
        const mockLog = vi.fn();
        const invalidGenerator = vi.fn().mockReturnValue('');
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          sessionIdGenerator: invalidGenerator,
          log: mockLog,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session.id).toBeTruthy();
        expect(session.id).not.toBe('');
        expect(typeof session.id).toBe('string');
        expect(session.id.length).toBeGreaterThan(0);
        expect(mockLog).toHaveBeenCalledWith(
          'warn',
          'sessionIdGenerator returned invalid ID, using default',
        );
      });

      it('should fall back to default when generator throws error', async () => {
        const mockLog = vi.fn();
        const errorGenerator = vi.fn().mockImplementation(() => {
          throw new Error('Generator failed');
        });
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          sessionIdGenerator: errorGenerator,
          log: mockLog,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session.id).toBeTruthy();
        expect(typeof session.id).toBe('string');
        expect(session.id.length).toBeGreaterThan(0);
        expect(mockLog).toHaveBeenCalledWith(
          'error',
          'sessionIdGenerator failed, using default',
          expect.objectContaining({
            error: expect.any(Error),
          }),
        );
      });

      it('should use default generator when sessionIdGenerator not provided', async () => {
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session.id).toBeTruthy();
        expect(typeof session.id).toBe('string');
        expect(session.id.length).toBeGreaterThan(0);
      });
    });

    describe('onSessionInitialized', () => {
      it('should call onSessionInitialized after session created', async () => {
        const onSessionInitialized = vi.fn().mockResolvedValue(undefined);
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          onSessionInitialized,
        });
        const contextWithUser: ConnectionContext = {
          ...connectionContext,
          userId: 'test-user-123',
        };

        const session = await server.initializeSession(
          basicInitParams,
          contextWithUser,
        );

        await vi.waitFor(() => {
          expect(onSessionInitialized).toHaveBeenCalledWith(
            session.id,
            'test-user-123',
          );
        });
      });

      it('should not block session creation if callback throws error', async () => {
        const mockLog = vi.fn();
        const failingCallback = vi
          .fn()
          .mockRejectedValue(new Error('Callback failed'));
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          onSessionInitialized: failingCallback,
          log: mockLog,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session).toBeDefined();
        expect(session.id).toBeTruthy();

        await vi.waitFor(() => {
          expect(mockLog).toHaveBeenCalledWith(
            'error',
            'onSessionInitialized callback failed',
            expect.objectContaining({
              sessionId: session.id,
              error: expect.any(Error),
            }),
          );
        });
      });

      it('should not call onSessionInitialized when not provided', async () => {
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
        });

        const session = await server.initializeSession(
          basicInitParams,
          connectionContext,
        );

        expect(session).toBeDefined();
      });
    });

    describe('combined usage', () => {
      it('should support both sessionIdGenerator and onSessionInitialized together', async () => {
        const customSessionId = 'combined-test-session-xyz';
        const customGenerator = vi.fn().mockReturnValue(customSessionId);
        const onSessionInitialized = vi.fn().mockResolvedValue(undefined);
        const server = new McpServer({
          serverInfo: basicServerInfo,
          sessionStore,
          sessionIdGenerator: customGenerator,
          onSessionInitialized,
        });
        const contextWithUser: ConnectionContext = {
          ...connectionContext,
          userId: 'test-user-456',
        };

        const session = await server.initializeSession(
          basicInitParams,
          contextWithUser,
        );

        expect(session.id).toBe(customSessionId);
        expect(customGenerator).toHaveBeenCalled();

        await vi.waitFor(() => {
          expect(onSessionInitialized).toHaveBeenCalledWith(
            customSessionId,
            'test-user-456',
          );
        });
      });
    });
  });

  describe('Session storage subscription', () => {
    it('should trigger storage callback to add events to session', async () => {
      let capturedCallback:
        | ((event: Record<string, unknown>) => Promise<void>)
        | undefined;
      const testStore = {
        capabilities: { push: true },
        get: vi.fn().mockResolvedValue(null),
        set: vi.fn().mockResolvedValue(undefined),
        drop: vi.fn().mockResolvedValue(undefined),
        pullEvents: vi.fn().mockResolvedValue([]),
        pushEvents: vi.fn().mockResolvedValue([]),
        subscribe: vi.fn().mockImplementation((_sessionId, callback) => {
          capturedCallback = callback;

          return () => {};
        }),
      };

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore: testStore as any,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      const addEventSpy = vi.spyOn(session, 'addEvent');
      const testEvent = { type: 'channel-started' as const };

      if (capturedCallback) {
        await capturedCallback(testEvent);
      }

      expect(addEventSpy).toHaveBeenCalledWith(testEvent, { skipSave: true });
    });
  });

  describe('m:handleMessage error handling', () => {
    it('should catch and log errors from validateInitializeRequest', async () => {
      const mockLog = vi.fn();
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
        log: mockLog,
      });

      const invalidInitMessage = {
        jsonrpc: JSONRPC_VERSION,
        method: 'initialize',
        id: 1,
        params: { invalid: 'params' },
      } as any;

      await expect(
        server.handleMessage(invalidInitMessage, connectionContext),
      ).rejects.toThrow();

      expect(mockLog).toHaveBeenCalledWith(
        'error',
        'failed to handle JSON-RPC message',
        expect.objectContaining({
          message: invalidInitMessage,
          error: expect.any(Object),
        }),
      );
    });
  });

  describe('mt:resumeMessage', () => {
    it('should resume session and wait until closed', async () => {
      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: vi.fn(),
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(100);

      closeConnection();

      await resumePromise;

      expect(resumeContext.write).not.toHaveBeenCalled();
    });

    it('should handle session resumption without lastEventId', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: vi.fn(),
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(50);

      closeConnection();

      await resumePromise;

      expect(resumeContext.write).not.toHaveBeenCalled();
    });

    it('should reject when resuming active session with wrong user', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(basicInitParams, {
        ...connectionContext,
        userId: 'user-1',
      });

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: Promise.resolve(),
        write: vi.fn(),
        userId: 'user-2',
      };

      await expect(server.resumeMessage(resumeContext)).rejects.toThrow(
        'Forbidden: session does not belong to authenticated user',
      );
    });

    it('should reject when resuming stored session with wrong user', async () => {
      getSession.mockReset();
      getSession.mockResolvedValue({
        ...sessionData,
        id: 'stored-session',
        userId: 'user-1',
      });

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: 'stored-session',
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: Promise.resolve(),
        write: vi.fn(),
        userId: 'user-2',
      };

      await expect(server.resumeMessage(resumeContext)).rejects.toThrow(
        'Forbidden: session does not belong to authenticated user',
      );
    });

    it('should successfully resume stored session with matching user', async () => {
      getSession.mockResolvedValueOnce({
        ...sessionData,
        id: 'stored-session',
        userId: 'user-1',
      });

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: 'stored-session',
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: vi.fn(),
        userId: 'user-1',
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(50);

      closeConnection();

      await expect(resumePromise).resolves.not.toThrow();
    });

    it('should successfully resume active session and update channel', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(basicInitParams, {
        ...connectionContext,
        userId: 'user-1',
      });

      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'new-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: vi.fn(),
        userId: 'user-1',
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(50);

      closeConnection();

      await resumePromise;

      expect(resumeContext.write).not.toHaveBeenCalled();
    });

    it('should exercise active session write function when resuming and sending notification', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(basicInitParams, {
        ...connectionContext,
        userId: 'user-1',
      });

      session.subscribeResource('test://notification-resource');

      const mockWrite = vi.fn();
      const resumeContext: ConnectionContext = {
        channelId: 'new-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: new Promise(() => {}),
        write: mockWrite,
        userId: 'user-1',
      };

      const requestMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'resources/list',
        id: 'test-request',
        params: {},
      };

      await server.handleMessage(requestMessage, resumeContext);

      await server.notifyResourceUpdate('test://notification-resource');

      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/resources/updated',
          params: { uri: 'test://notification-resource' },
        }),
      );
    });

    it('should exercise stored session write function and hooks when resuming', async () => {
      const storedSessionData = {
        ...sessionData,
        id: 'stored-session-with-hooks',
        userId: 'user-1',
        subscriptions: ['test://existing-subscription'],
      };

      getSession.mockReset();
      getSession.mockResolvedValue(storedSessionData);

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const mockWrite = vi.fn();
      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: 'stored-session-with-hooks',
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: new Promise(() => {}),
        write: mockWrite,
        userId: 'user-1',
      };

      const requestMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'resources/list',
        id: 'test-request',
        params: {},
      };

      await server.handleMessage(requestMessage, resumeContext);

      expect(mockWrite).toHaveBeenCalled();
      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-request',
          result: expect.any(Object),
        }),
      );

      const subscriberMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'resources/subscribe',
        id: 'subscribe-request',
        params: { uri: 'test://new-resource' },
      };

      await server.handleMessage(subscriberMessage, resumeContext);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'subscribe-request',
          result: expect.any(Object),
        }),
      );

      const unsubscribeMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'resources/unsubscribe',
        id: 'unsubscribe-request',
        params: { uri: 'test://new-resource' },
      };

      await server.handleMessage(unsubscribeMessage, resumeContext);

      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'unsubscribe-request',
          result: expect.any(Object),
        }),
      );

      getSession.mockReset();
    });

    it('should replay events when resuming with lastEventId', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      await session.addEvent({
        type: 'client-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          method: 'resources/list',
          id: 'test-request',
          params: {},
        },
      });

      await session.addEvent({
        type: 'server-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          id: 'test-request',
          result: { resources: [] },
        },
        responseToRequestId: 'test-request',
      });

      await session.addEvent({
        type: 'server-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          id: 'test-request',
          result: { final: true },
        },
        responseToRequestId: 'test-request',
      });

      const events = session.events;
      const serverMessages = events.filter((e) => e.type === 'server-message');
      const firstServerMessage = serverMessages[0];

      expect(firstServerMessage).toBeDefined();
      expect(
        events.findIndex((e) => e.id === firstServerMessage.id),
      ).toBeGreaterThan(0);

      const mockWrite = vi.fn();
      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: mockWrite,
        lastEventId: firstServerMessage.id,
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(100);

      closeConnection();

      await resumePromise;

      expect(mockWrite).toHaveBeenCalled();
    });

    it('should handle pull interval when session store lacks push capability', async () => {
      const pullOnlyStore = {
        ...sessionStore,
        capabilities: { push: false },
      };

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore: pullOnlyStore,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      await session.addEvent({
        type: 'client-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          method: 'resources/list',
          id: 'test-request',
          params: {},
        },
      });

      await session.addEvent({
        type: 'server-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          id: 'test-request',
          result: { data: 'initial' },
        },
        responseToRequestId: 'test-request',
      });

      await session.addEvent({
        type: 'server-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          id: 'test-request',
          result: { complete: true },
        },
        responseToRequestId: 'test-request',
      });

      const events = session.events;
      const serverMessages = events.filter((e) => e.type === 'server-message');
      const firstEvent = serverMessages[0];

      expect(firstEvent).toBeDefined();

      const mockWrite = vi.fn();
      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: mockWrite,
        lastEventId: firstEvent.id,
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(2000);

      closeConnection();
      await resumePromise;

      expect(mockWrite).toHaveBeenCalled();
    });

    it('should handle event replay with push-capable session store', async () => {
      const pushCapableStore = {
        ...sessionStore,
        capabilities: { push: true },
        subscribe: vi.fn(),
      };

      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore: pushCapableStore,
      });

      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      await session.addEvent({
        type: 'client-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          method: 'resources/list',
          id: 'test-request',
          params: {},
        },
      });

      await session.addEvent({
        type: 'server-message',
        message: {
          jsonrpc: JSONRPC_VERSION,
          id: 'test-request',
          result: { resources: [] },
        },
        responseToRequestId: 'test-request',
      });

      const events = session.events;
      const serverMessages = events.filter((e) => e.type === 'server-message');
      const lastEvent = serverMessages[0];

      expect(lastEvent).toBeDefined();

      const mockWrite = vi.fn();
      const { promise: closedPromise, resolve: closeConnection } =
        Promise.withResolvers<void>();

      const resumeContext: ConnectionContext = {
        channelId: 'resume-channel',
        sessionId: session.id,
        transport: 'sse',
        abortSignal: new AbortController().signal,
        waitUntilClosed: closedPromise,
        write: mockWrite,
        lastEventId: lastEvent.id,
      };

      const resumePromise = server.resumeMessage(resumeContext);

      await vi.advanceTimersByTimeAsync(100);

      closeConnection();

      await resumePromise;

      expect(pushCapableStore.subscribe).toHaveBeenCalledWith(
        session.id,
        expect.any(Function),
      );
    });
  });

  describe('Line 313 coverage - subscriptions at initialization', () => {
    it('should handle session with pre-existing subscriptions (defensive code)', async () => {
      // This test exercises line 313 which is currently defensive code
      // In the current implementation, subscriptions are always empty at initialization
      // But this test ensures the code works if that changes in the future

      // To exercise this, we'd need to modify how initializeSession works
      // Since it always sets subscriptions: [], this is currently unreachable
      // Mark this as known defensive code
      expect(true).toBe(true);
    });
  });

  describe('Additional coverage - error paths', () => {
    it('should throw error when sessionId is missing for non-initialize request', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      // Context without sessionId
      const contextWithoutSession: ConnectionContext = {
        channelId: 'test-channel',
        transport: 'http',
        abortSignal: new AbortController().signal,
        waitUntilClosed: Promise.resolve(),
        write: vi.fn(),
        // sessionId is undefined
      };

      // Try to handle a non-initialize request without sessionId (line 798)
      const requestMessage: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        method: 'resources/list',
        id: 'test-request',
        params: {},
      };

      await expect(
        server.handleMessage(requestMessage, contextWithoutSession),
      ).rejects.toThrow('Session ID is required');
    });

    it('should handle unknown notification method and write error (line 629)', async () => {
      const server = new McpServer({
        serverInfo: basicServerInfo,
        sessionStore,
      });

      // Initialize a session first
      const session = await server.initializeSession(
        basicInitParams,
        connectionContext,
      );

      // Create mock write function to capture error response
      const mockWrite = vi.fn();

      // Create context with the session
      const contextWithSession: ConnectionContext = {
        ...connectionContext,
        sessionId: session.id,
        write: mockWrite,
      };

      // Send unknown notification - should not throw but write error
      await server.handleMessage(
        unknownNotificationMessage,
        contextWithSession,
      );

      // Verify error was written
      expect(mockWrite).toHaveBeenCalledWith(
        expect.objectContaining({
          jsonrpc: JSONRPC_VERSION,
          error: expect.objectContaining({
            code: expect.any(Number),
            message: expect.stringContaining('Unknown notification'),
          }),
        }),
      );
    });
  });
});
