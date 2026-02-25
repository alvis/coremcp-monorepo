import { SessionStore } from '@coremcp/core';
import { McpServer } from '@coremcp/server';
import { vi } from 'vitest';

import type { Log } from '@coremcp/core';
import type {
  CallTool,
  GetPrompt,
  ListPrompts,
  ListResources,
  ListTools,
  ReadResource,
} from '@coremcp/server';

import type { ResolveUserId } from '#types';

// common mock objects for server tests

export const getSession = vi.fn<SessionStore['get']>();
export const setSession = vi.fn<SessionStore['set']>();
export const dropSession = vi.fn<SessionStore['drop']>();
export const pullEvents = vi.fn<SessionStore['pullEvents']>();
export const pushEvents = vi.fn<SessionStore['pushEvents']>();
export const subscribe = vi.fn<SessionStore['subscribe']>();

export class MockSessionStore extends SessionStore {
  public capabilities = { push: false };
  public get = getSession;
  public set = setSession;
  public drop = dropSession;
  public pullEvents = pullEvents;
  public pushEvents = pushEvents;
  public subscribe = subscribe;
}

export const sessionStore: MockSessionStore = new MockSessionStore();

// create mock handler functions
const listTools = vi.fn<ListTools>();
const callTool = vi.fn<CallTool>();
const listPrompts = vi.fn<ListPrompts>();
const getPrompt = vi.fn<GetPrompt>();
const listResources = vi.fn<ListResources>();
const readResource = vi.fn<ReadResource>();

export const log = vi.fn<Log>();
export const resolveUserId = vi.fn<ResolveUserId>();

// create a mcp server for testing
export const mcpServer = new McpServer({
  serverInfo: {
    name: 'test-server',
    version: '1.0.0',
  },
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
