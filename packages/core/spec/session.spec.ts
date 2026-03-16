import { JSONRPC_VERSION } from '@coremcp/protocol';

import { describe, expect, it, vi } from 'vitest';

import { Session } from '#session/index';

import type {
  JsonRpcRequestEnvelope,
  Prompt,
  Resource,
  Tool,
} from '@coremcp/protocol';

import type {
  SessionContext,
  SessionData,
  SessionEvent,
  SessionEventInput,
} from '#session/index';

// CONSTANTS //

const baseSessionData: SessionData = {
  id: 'test-session-123',
  userId: 'user-123',
  protocolVersion: '2025-06-18',
  clientInfo: {
    name: 'TestClient',
    version: '1.0.0',
  },
  serverInfo: {
    name: 'TestServer',
    version: '1.0.0',
  },
  capabilities: {
    client: { roots: { listChanged: true } },
    server: { tools: {}, prompts: {}, resources: {} },
  },
  tools: [],
  prompts: [],
  resources: [],
  resourceTemplates: [],
  subscriptions: [],
  events: [],
};

const baseTool: Tool = {
  name: 'test-tool',
  description: 'A test tool',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  } as Tool['inputSchema'],
};

const basePrompt: Prompt = {
  name: 'test-prompt',
  description: 'A test prompt',
  arguments: [],
};

const baseResource: Resource = {
  uri: 'test://resource',
  name: 'Test Resource',
  description: 'A test resource',
  mimeType: 'application/json',
};

// HELPERS //

const withMockContext = (): SessionContext => ({});

const withSessionData = (
  overrides: Partial<SessionData> = {},
): SessionData => ({
  ...baseSessionData,
  ...overrides,
});

const createSession = (
  dataOverrides: Partial<SessionData> = {},
  contextOverrides: Partial<SessionContext> = {},
): Session => {
  const data = withSessionData(dataOverrides);
  const context = { ...withMockContext(), ...contextOverrides };

  return new Session(data, context);
};

// set system time at file level before all tests
vi.useFakeTimers();
vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

// TEST SUITES //

describe('cl:Session', () => {
  describe('mt:constructor', () => {
    it('should create session with provided data and initialize properties correctly', () => {
      const session = createSession();

      expect(session).toEqual(
        expect.objectContaining({
          id: 'test-session-123',
          userId: 'user-123',
          protocolVersion: '2025-06-18',
          clientInfo: { name: 'TestClient', version: '1.0.0' },
          serverInfo: { name: 'TestServer', version: '1.0.0' },
          capabilities: {
            client: { roots: { listChanged: true } },
            server: { tools: {}, prompts: {}, resources: {} },
          },
          tools: [],
          prompts: [],
          resources: [],
          firstActivity: null,
          lastActivity: null,
        }),
      );
    });

    it('should create session with null user', () => {
      const session = createSession({ userId: null });

      expect(session.userId).toBeNull();
    });
  });

  describe('array immutability', () => {
    it('should return defensive copies of all collection arrays', () => {
      const session = createSession();
      session.addTool(baseTool);
      session.addPrompt(basePrompt);
      session.addResource(baseResource);
      const tools = session.tools;
      const prompts = session.prompts;
      const resources = session.resources;

      tools.push({ ...baseTool, name: 'modified-tool' });
      prompts.push({ ...basePrompt, name: 'modified-prompt' });
      resources.push({ ...baseResource, uri: 'test://modified' });

      expect(session).toEqual(
        expect.objectContaining({
          tools: [baseTool],
          prompts: [basePrompt],
          resources: [baseResource],
        }),
      );
    });
  });

  describe('mt:addTool', () => {
    it('should manage tools lifecycle correctly', () => {
      const session = createSession();
      const tool1: Tool = { ...baseTool, name: 'tool-1' };
      const tool2: Tool = { ...baseTool, name: 'tool-2' };
      const updatedTool1: Tool = { ...tool1, description: 'Updated' };

      expect(session.tools).toEqual([]);

      session.addTool(tool1);
      session.addTool(tool2);

      expect(session.tools).toEqual([tool1, tool2]);

      session.addTool(updatedTool1);

      expect(session.tools).toEqual([updatedTool1, tool2]);

      const dropResult = session.dropTool('tool-1');

      expect(dropResult).toBe(true);
      expect(session.tools).toEqual([tool2]);

      const notFoundResult = session.dropTool('non-existent');

      expect(notFoundResult).toBe(false);
      expect(session.tools).toEqual([tool2]);
    });

    it('should update activity when modifying tools', () => {
      const session = createSession();

      expect(session.lastActivity).toBeNull();

      vi.advanceTimersByTime(1000);
      session.addTool(baseTool);

      expect(session.lastActivity).not.toBeNull();
      expect(session.lastActivity).toBe(Date.now());

      const afterAdd = session.lastActivity;
      vi.advanceTimersByTime(1000);
      const dropResult = session.dropTool(baseTool.name);

      if (dropResult) {
        expect(session.lastActivity).toBeGreaterThan(afterAdd!);
      }
    });

    it('should set tools from record', () => {
      const session = createSession();
      const toolsRecord: Record<string, Tool> = {
        'tool-1': { ...baseTool, name: 'tool-1' },
        'tool-2': { ...baseTool, name: 'tool-2' },
      };

      session.tools = toolsRecord;

      expect(session.tools).toHaveLength(2);
    });
  });

  describe('mt:addPrompt', () => {
    it('should manage prompts lifecycle correctly', () => {
      const session = createSession();
      const prompt1: Prompt = { ...basePrompt, name: 'prompt-1' };
      const prompt2: Prompt = { ...basePrompt, name: 'prompt-2' };
      const updatedPrompt1: Prompt = { ...prompt1, description: 'Updated' };

      expect(session.prompts).toEqual([]);

      session.addPrompt(prompt1);
      session.addPrompt(prompt2);

      expect(session.prompts).toEqual([prompt1, prompt2]);

      session.addPrompt(updatedPrompt1);

      expect(session.prompts).toEqual([updatedPrompt1, prompt2]);

      const dropResult = session.dropPrompt('prompt-1');

      expect(dropResult).toBe(true);
      expect(session.prompts).toEqual([prompt2]);

      const notFoundResult = session.dropPrompt('non-existent');

      expect(notFoundResult).toBe(false);
      expect(session.prompts).toEqual([prompt2]);
    });

    it('should update activity when modifying prompts', () => {
      const session = createSession();

      expect(session.lastActivity).toBeNull();

      vi.advanceTimersByTime(1000);
      session.addPrompt(basePrompt);

      expect(session.lastActivity).not.toBeNull();
      expect(session.lastActivity).toBe(Date.now());

      const afterAdd = session.lastActivity;
      vi.advanceTimersByTime(1000);
      const dropResult = session.dropPrompt(basePrompt.name);

      if (dropResult) {
        expect(session.lastActivity).toBeGreaterThan(afterAdd!);
      }
    });

    it('should set prompts from record', () => {
      const session = createSession();
      const promptsRecord: Record<string, Prompt> = {
        'prompt-1': { ...basePrompt, name: 'prompt-1' },
        'prompt-2': { ...basePrompt, name: 'prompt-2' },
      };

      session.prompts = promptsRecord;

      expect(session.prompts).toHaveLength(2);
    });
  });

  describe('mt:addResource', () => {
    it('should manage resources lifecycle correctly', () => {
      const session = createSession();
      const resource1: Resource = { ...baseResource, uri: 'resource-1' };
      const resource2: Resource = { ...baseResource, uri: 'resource-2' };
      const updatedResource1: Resource = {
        ...resource1,
        description: 'Updated',
      };

      expect(session.resources).toEqual([]);

      session.addResource(resource1);
      session.addResource(resource2);

      expect(session.resources).toEqual([resource1, resource2]);

      session.addResource(updatedResource1);

      expect(session.resources).toEqual([updatedResource1, resource2]);

      const dropResult = session.dropResource('resource-1');

      expect(dropResult).toBe(true);
      expect(session.resources).toEqual([resource2]);

      const notFoundResult = session.dropResource('non-existent');

      expect(notFoundResult).toBe(false);
      expect(session.resources).toEqual([resource2]);
    });

    it('should update activity when modifying resources', () => {
      const session = createSession();

      expect(session.lastActivity).toBeNull();

      vi.advanceTimersByTime(1000);
      session.addResource(baseResource);

      expect(session.lastActivity).not.toBeNull();
      expect(session.lastActivity).toBe(Date.now());

      const afterAdd = session.lastActivity;
      vi.advanceTimersByTime(1000);
      const dropResult = session.dropResource(baseResource.uri);

      if (dropResult) {
        expect(session.lastActivity).toBeGreaterThan(afterAdd!);
      }
    });

    it('should set resources from record', () => {
      const session = createSession();
      const resourcesRecord: Record<string, Resource> = {
        'resource-1': { ...baseResource, uri: 'resource-1' },
        'resource-2': { ...baseResource, uri: 'resource-2' },
      };

      session.resources = resourcesRecord;

      expect(session.resources).toHaveLength(2);
    });
  });

  describe('mt:startRequest', () => {
    it('should return empty map initially', () => {
      const session = createSession();

      expect(session.activeRequests.size).toBe(0);
    });

    it('should manage active requests correctly', () => {
      const session = createSession();
      const requestId = 'request-id';
      const request: JsonRpcRequestEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        id: requestId,
        method: 'test/method',
        params: undefined,
      };

      const controller = session.startRequest(requestId, request);

      expect(session.activeRequests.size).toBe(1);
      expect(session.activeRequests.has(requestId)).toBe(true);
      const activeRequest = session.activeRequests.get(requestId);
      expect(activeRequest).toEqual(
        expect.objectContaining({
          request,
          controller,
        }),
      );
    });
  });

  describe('activity tracking', () => {
    it('should update activity timestamp when adding tools', () => {
      const session = createSession();

      expect(session.lastActivity).toBeNull();

      vi.advanceTimersByTime(1000);
      session.addTool(baseTool);

      expect(session.lastActivity).not.toBeNull();
      expect(session.lastActivity).toBe(Date.now());
    });
  });

  describe('mt:toJSON', () => {
    it('should return complete session data with all collections', () => {
      const session = createSession();
      session.addTool(baseTool);
      session.addPrompt(basePrompt);
      session.addResource(baseResource);

      const result = session.toJSON();

      expect(result).toEqual(expect.objectContaining({
        id: 'test-session-123',
        userId: 'user-123',
        protocolVersion: '2025-06-18',
        clientInfo: { name: 'TestClient', version: '1.0.0' },
        serverInfo: { name: 'TestServer', version: '1.0.0' },
        capabilities: {
          client: { roots: { listChanged: true } },
          server: { tools: {}, prompts: {}, resources: {} },
        },
        tools: [baseTool],
        prompts: [basePrompt],
        resources: [baseResource],
        resourceTemplates: [],
        subscriptions: [],
      }));

      // verify list_changed notification events were recorded
      expect(result.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: 'server-message', message: expect.objectContaining({ method: 'notifications/tools/list_changed' }) }),
          expect.objectContaining({ type: 'server-message', message: expect.objectContaining({ method: 'notifications/prompts/list_changed' }) }),
          expect.objectContaining({ type: 'server-message', message: expect.objectContaining({ method: 'notifications/resources/list_changed' }) }),
        ]),
      );

      result.tools.push({ ...baseTool, name: 'new-tool' });

      expect(session.tools).toHaveLength(1);
      expect(result.tools).toHaveLength(2);
    });

    it('should handle null user correctly', () => {
      const session = createSession({ userId: null });

      const result = session.toJSON();

      expect(result.userId).toBeNull();
    });

    it('should include instructions when provided', () => {
      const session = createSession({ instructions: 'Server usage instructions' });

      const result = session.toJSON();

      expect(result.instructions).toBe('Server usage instructions');
    });

    it('should omit instructions when not provided', () => {
      const session = createSession();

      const result = session.toJSON();

      expect(result).not.toHaveProperty('instructions');
    });
  });

  describe('edge cases and error scenarios', () => {
    it('should handle minimal session data', () => {
      const minimalData = withSessionData({
        id: '',
        userId: null,
        protocolVersion: '',
        clientInfo: { name: '', version: '' },
        serverInfo: { name: '', version: '' },
        capabilities: { client: {}, server: {} },
      });

      const session = createSession(minimalData);

      expect(session).toEqual(
        expect.objectContaining({
          id: '',
          userId: null,
          protocolVersion: '',
          tools: [],
          prompts: [],
          resources: [],
        }),
      );
    });

    it('should handle operations on empty collections gracefully', () => {
      const session = createSession();

      expect(session.dropTool('non-existent')).toBe(false);
      expect(session.dropPrompt('non-existent')).toBe(false);
      expect(session.dropResource('non-existent')).toBe(false);
    });
  });

  describe('event-based state management', () => {
    it('should compute timestamps from events during construction', () => {
      const events = [
        {
          id: 'e1',
          occurredAt: 1000,
          type: 'client-message',
          channelId: 'channel-1',
          message: { jsonrpc: '2.0', id: 'req-1', method: 'init', params: {} },
        },
        {
          id: 'e2',
          occurredAt: 3000,
          type: 'client-message',
          channelId: 'channel-1',
          message: {
            jsonrpc: '2.0',
            id: 'req-2',
            method: 'update',
            params: {},
          },
        },
        {
          id: 'e3',
          occurredAt: 2000,
          type: 'client-message',
          channelId: 'channel-1',
          message: { jsonrpc: '2.0', id: 'req-3', method: 'test', params: {} },
        },
      ] as SessionEvent[];

      const session = createSession({ events });

      expect(session).toEqual(
        expect.objectContaining({
          firstActivity: 1000,
          lastActivity: 3000,
        }),
      );
    });

    it('should default to null timestamps when no events exist', () => {
      const session = createSession({ events: [] });

      expect(session).toEqual(
        expect.objectContaining({
          firstActivity: null,
          lastActivity: null,
        }),
      );
      expect(Object.keys(session.requests)).toHaveLength(0);
    });
  });

  describe('gt:instructions', () => {
    it('should return undefined when no instructions provided', () => {
      const session = createSession();

      expect(session.instructions).toBeUndefined();
    });

    it('should return instructions when provided', () => {
      const session = createSession({ instructions: 'Use this server for testing' });

      expect(session.instructions).toBe('Use this server for testing');
    });
  });

  describe('gt:logLevel', () => {
    it('should default to null', () => {
      const session = createSession();

      expect(session.logLevel).toBeNull();
    });
  });

  describe('st:logLevel', () => {
    it('should store the configured level', () => {
      const session = createSession();

      session.logLevel = 'warning';

      expect(session.logLevel).toBe('warning');
    });

    it('should allow resetting to null', () => {
      const session = createSession();
      session.logLevel = 'error';

      session.logLevel = null;

      expect(session.logLevel).toBeNull();
    });
  });

  describe('mt:sendLog', () => {
    it('should send notification when no log level threshold is set', async () => {
      const session = createSession();
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('info', 'test message');

      expect(notifySpy).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: { level: 'info', data: 'test message' },
      });

      notifySpy.mockRestore();
    });

    it('should send notification when message level meets threshold', async () => {
      const session = createSession();
      session.logLevel = 'warning';
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('error', 'error message');

      expect(notifySpy).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: { level: 'error', data: 'error message' },
      });

      notifySpy.mockRestore();
    });

    it('should send notification when message level equals threshold', async () => {
      const session = createSession();
      session.logLevel = 'warning';
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('warning', 'warning message');

      expect(notifySpy).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: { level: 'warning', data: 'warning message' },
      });

      notifySpy.mockRestore();
    });

    it('should filter notification when message level is below threshold', async () => {
      const session = createSession();
      session.logLevel = 'warning';
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('info', 'info should be filtered');

      expect(notifySpy).not.toHaveBeenCalled();

      notifySpy.mockRestore();
    });

    it('should include logger field when provided', async () => {
      const session = createSession();
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('info', 'test message', 'test-logger');

      expect(notifySpy).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: { level: 'info', data: 'test message', logger: 'test-logger' },
      });

      notifySpy.mockRestore();
    });

    it('should omit logger field when not provided', async () => {
      const session = createSession();
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('error', 'error data');

      const callArg = notifySpy.mock.calls[0]?.[0] as Record<string, unknown>;
      const params = callArg?.params as Record<string, unknown>;
      expect(params).not.toHaveProperty('logger');

      notifySpy.mockRestore();
    });

    it('should filter debug messages when threshold is emergency', async () => {
      const session = createSession();
      session.logLevel = 'emergency';
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('debug', 'debug message');

      expect(notifySpy).not.toHaveBeenCalled();

      notifySpy.mockRestore();
    });

    it('should pass emergency messages regardless of threshold', async () => {
      const session = createSession();
      session.logLevel = 'emergency';
      const notifySpy = vi.spyOn(session, 'notify');

      await session.sendLog('emergency', 'critical failure');

      expect(notifySpy).toHaveBeenCalledWith({
        method: 'notifications/message',
        params: { level: 'emergency', data: 'critical failure' },
      });

      notifySpy.mockRestore();
    });
  });

  describe('mt:addListener', () => {
    const notificationEventInput: SessionEventInput = {
      type: 'server-message',
      message: {
        jsonrpc: JSONRPC_VERSION,
        method: 'notifications/test',
      },
    };

    it('should fire listener when addEvent is called', async () => {
      const session = createSession();
      const received: SessionEvent[] = [];
      session.addListener((event) => received.push(event));

      await session.addEvent(notificationEventInput);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(
        expect.objectContaining({ type: 'server-message' }),
      );
    });

    it('should stop notifications after unsubscribe', async () => {
      const session = createSession();
      const received: SessionEvent[] = [];
      const unsubscribe = session.addListener((event) => received.push(event));

      await session.addEvent(notificationEventInput);

      unsubscribe();

      await session.addEvent(notificationEventInput);

      expect(received).toHaveLength(1);
    });

    it('should notify multiple listeners', async () => {
      const session = createSession();
      const received1: SessionEvent[] = [];
      const received2: SessionEvent[] = [];
      session.addListener((event) => received1.push(event));
      session.addListener((event) => received2.push(event));

      await session.addEvent(notificationEventInput);

      expect(received1).toHaveLength(1);
      expect(received2).toHaveLength(1);
    });

    it('should pass the correct event object to listeners', async () => {
      const session = createSession();
      const received: SessionEvent[] = [];
      session.addListener((event) => received.push(event));

      session.addTool(baseTool);

      // addTool triggers #notify which calls reply() in a fire-and-forget
      // manner; flush the microtask queue so the async reply chain
      // (channel.write -> addEvent -> listener) completes
      await vi.advanceTimersByTimeAsync(0);

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual(
        expect.objectContaining({
          type: 'server-message',
        }),
      );
    });
  });
});
