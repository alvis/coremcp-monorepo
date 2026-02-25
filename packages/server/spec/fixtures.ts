import { Session, SessionStore } from '@coremcp/core';
import { JSONRPC_VERSION } from '@coremcp/protocol';
import { vi } from 'vitest';

import type { Log, SessionContext, SessionData } from '@coremcp/core';
import type {
  AppInfo,
  CallToolRequest,
  ClientCapabilities,
  CompleteRequest,
  InitializeRequest,
  JsonRpcNotificationEnvelope,
  JsonRpcRequestEnvelope,
  PingRequest,
  PromptReference,
  Resource,
  Tool,
} from '@coremcp/protocol';

import type { ConnectionContext } from '#types';

const write = vi.fn();

export const sessionData: SessionData = {
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

export const sessionContext: SessionContext = {
  channel: {
    id: 'test-channel',
    side: 'server',
    write,
  },
};

const controller = new AbortController();
export const abort: AbortSignal = controller.signal;

export const session = new Session(sessionData, sessionContext);

export const sessionWithUser = new Session(
  {
    ...sessionData,
    userId: 'user-123',
  },
  sessionContext,
);

export const legacySession = new Session(
  {
    ...sessionData,
    protocolVersion: '2024-11-05',
  },
  sessionContext,
);

export const sessionWithDifferentVersion = new Session(
  {
    ...sessionData,
    protocolVersion: '2025-03-26',
  },
  sessionContext,
);

export const sessionWithTools = new Session(
  {
    ...sessionData,
    tools: [
      {
        name: 'available-tool',
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        } as Tool['inputSchema'],
      },
    ],
  },
  sessionContext,
);

export const minimalSession = new Session(
  {
    ...sessionData,
    id: 'minimal',
  },
  sessionContext,
);

export const sessionWithEmptyCapabilities = new Session(
  {
    ...sessionData,
    capabilities: { client: {}, server: {} },
  },
  sessionContext,
);

export const sessionWithCustomServerInfo = new Session(
  {
    ...sessionData,
    serverInfo: { name: 'Custom Server', version: '2.0.0' },
  },
  sessionContext,
);

export const sessionWithComplexCapabilities = new Session(
  {
    ...sessionData,
    capabilities: {
      client: { roots: { listChanged: true } },
      server: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
        completions: {},
      },
    },
  },
  sessionContext,
);

export const getSession = vi.fn<SessionStore['get']>();
export const setSession = vi.fn<SessionStore['set']>();
export const dropSession = vi.fn<SessionStore['drop']>();
export const pullEvents = vi.fn<SessionStore['pullEvents']>();
export const pushEvents = vi.fn<SessionStore['pushEvents']>();
export const onEvent = vi.fn<SessionStore['subscribe']>();

export class MockSessionStore extends SessionStore {
  public capabilities = { push: false };
  public get = getSession;
  public set = setSession;
  public drop = dropSession;
  public pullEvents = pullEvents;
  public pushEvents = pushEvents;
  public subscribe = onEvent;
}

export const sessionStore: MockSessionStore = new MockSessionStore();

export const log = vi.fn<Log>();
export const send = vi.fn<ConnectionContext['write']>();

export const basicServerInfo: AppInfo = {
  name: 'test-server',
  version: '1.0.0',
};

export const connectionContext: ConnectionContext = {
  channelId: 'test-channel',
  sessionId: 'test-session-id',
  transport: 'test',
  abortSignal: new AbortController().signal,
  waitUntilClosed: Promise.resolve(),
  write: send,
};

export const sessionStorageData = {
  existing: {
    id: 'existing-session',
    user: { id: 'user1' },
    messages: ['msg1'],
    createdAt: Date.now() - 1000,
    subscriptions: ['test://resource'],
  },
  differentUser: {
    id: 'previous-session',
    user: { id: 'user1' },
    messages: ['msg1'],
    createdAt: Date.now() - 1000,
    subscriptions: ['test://resource'],
  },
};

export const commonTestTools: Tool[] = [
  {
    name: 'echo',
    description: 'Echoes back text',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    } as Tool['inputSchema'],
  },
  {
    name: 'calculator',
    description: 'Performs calculations',
    inputSchema: {
      type: 'object',
      properties: { expression: { type: 'string' } },
      required: ['expression'],
    } as Tool['inputSchema'],
  },
];

export const singleTestTool: Tool = {
  name: 'test-tool',
  description: 'A simple test tool',
  inputSchema: {
    type: 'object',
    properties: { input: { type: 'string' } },
    required: ['input'],
  } as Tool['inputSchema'],
};

export const commonTestResources: Resource[] = [
  {
    uri: 'test://resource1',
    name: 'resource1',
    description: 'First resource',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://resource2',
    name: 'resource2',
    description: 'Second resource',
    mimeType: 'application/json',
  },
  {
    uri: 'test://resource3',
    name: 'resource3',
    description: 'Third resource',
    mimeType: 'text/html',
  },
];

export const sessionWithCommonTools = new Session(
  {
    ...sessionData,
    tools: commonTestTools,
  },
  sessionContext,
);

export const sessionWithCommonResources = new Session(
  {
    ...sessionData,
    resources: commonTestResources,
  },
  sessionContext,
);

export const sessionWithSingleTool = new Session(
  {
    ...sessionData,
    tools: [singleTestTool],
  },
  sessionContext,
);

export const sessionWithPrompts = new Session(
  {
    ...sessionData,
    prompts: [
      { name: 'prompt1', description: 'First prompt' },
      { name: 'prompt2', description: 'Second prompt' },
      { name: 'prompt3', description: 'Third prompt' },
    ],
  },
  sessionContext,
);

export const basicCallToolParams: CallToolRequest['params'] = {
  name: 'test-tool',
  arguments: { input: 'test-value' },
};

export const customCallToolParams: CallToolRequest['params'] = {
  name: 'my-custom-tool',
  arguments: { param1: 'value1' },
};

export const specialCharsCallToolParams: CallToolRequest['params'] = {
  name: 'tool-with-dashes_and_underscores',
  arguments: { input: 'test' },
};

export const noArgsCallToolParams: CallToolRequest['params'] = {
  name: 'no-args-tool',
};

export const emptyCallToolParams: CallToolRequest['params'] = {
  name: '',
  arguments: { input: 'test' },
};

export const complexCallToolParams: CallToolRequest['params'] = {
  name: 'complex-tool',
  arguments: {
    stringArg: 'test-string',
    numberArg: 42,
    booleanArg: true,
    arrayArg: ['item1', 'item2'],
    objectArg: { nested: 'value', count: 10 },
  },
};

export const basicCompletionParams: CompleteRequest['params'] = {
  ref: { type: 'ref/prompt', name: 'test-ref' } satisfies PromptReference,
  argument: { name: 'test-arg', value: 'test-value' },
  context: { arguments: { additional: 'context' } },
};

export const withoutContextCompletionParams: CompleteRequest['params'] = {
  ref: { type: 'ref/prompt', name: 'test-ref' } satisfies PromptReference,
  argument: { name: 'test-arg', value: 'test-value' },
};

export const currentProtocolInitializeParams: InitializeRequest['params'] = {
  protocolVersion: '2025-06-18',
  capabilities: {} as ClientCapabilities,
  clientInfo: { name: 'test-client', version: '1.0.0' },
};

export const legacyProtocolInitializeParams: InitializeRequest['params'] = {
  protocolVersion: '2024-11-05',
  capabilities: {} as ClientCapabilities,
  clientInfo: { name: 'test-client', version: '1.0.0' },
};

export const basicInitParams: InitializeRequest['params'] = {
  protocolVersion: '2025-06-18',
  capabilities: {} as ClientCapabilities,
  clientInfo: { name: 'test-client', version: '1.0.0' },
};

export const standardInitializeParams: InitializeRequest['params'] =
  currentProtocolInitializeParams;

export const legacyInitializeParams: InitializeRequest['params'] =
  legacyProtocolInitializeParams;

export const pingMessage: JsonRpcRequestEnvelope<PingRequest> = {
  jsonrpc: JSONRPC_VERSION,
  method: 'ping',
  id: 1,
  params: undefined,
};

export const unknownMethodMessage: JsonRpcRequestEnvelope<any> = {
  jsonrpc: JSONRPC_VERSION,
  method: 'unknown/method',
  id: 1,
  params: undefined,
};

export const initializedNotificationMessage = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/initialized' as const,
} satisfies JsonRpcNotificationEnvelope;

export const contextWithoutSessionId: ConnectionContext = {
  channelId: 'test-channel',
  transport: 'test',
  abortSignal: new AbortController().signal,
  waitUntilClosed: Promise.resolve(),
  write: vi.fn(),
  // sessionId is undefined
};

export const contextWithSession1Named: ConnectionContext = {
  ...connectionContext,
  sessionId: 'session1',
};

export const contextWithSession2Named: ConnectionContext = {
  ...connectionContext,
  sessionId: 'session2',
};

export const contextWithPreviousSession: ConnectionContext = {
  ...connectionContext,
  sessionId: 'previous-session-id',
  userId: 'matching-user-id',
};

export const contextWithNewSession: ConnectionContext = {
  channelId: 'new-channel',
  sessionId: 'new-session',
  transport: 'test',
  abortSignal: new AbortController().signal,
  waitUntilClosed: Promise.resolve(),
  write: vi.fn(),
};

export const cancelledNotificationMessageWithParams = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/cancelled',
  params: { requestId: 'test-request-123' },
} as JsonRpcNotificationEnvelope;

export const unknownNotificationMessage = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/unknown',
} as JsonRpcNotificationEnvelope;

export const malformedCancelledNotificationMessage = {
  jsonrpc: JSONRPC_VERSION,
  method: 'notifications/cancelled',
};

export const testSessionForNotification = new Session(
  { ...sessionData, protocolVersion: '2025-06-18' },
  sessionContext,
);

export const sessionWithSubscriptions = new Session(
  {
    ...sessionData,
    subscriptions: ['test://resource1', 'test://resource2'],
  },
  sessionContext,
);
