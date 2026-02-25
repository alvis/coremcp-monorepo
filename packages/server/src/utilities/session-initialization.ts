/**
 * session initialization utilities for mcp server
 *
 * provides factory functions for creating session data objects
 * used during mcp session initialization.
 * @module
 */

import type { SessionData } from '@coremcp/core';
import type {
  AppInfo,
  ClientCapabilities,
  Prompt,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

/** options for creating session data */
export interface CreateSessionDataOptions {
  /** session identifier */
  sessionId: string;
  /** negotiated protocol version */
  protocolVersion: string;
  /** authenticated user id or undefined for anonymous */
  userId?: string;
  /** client application information */
  clientInfo: AppInfo;
  /** server application information */
  serverInfo: AppInfo;
  /** client capabilities */
  clientCapabilities: ClientCapabilities;
  /** server capabilities */
  serverCapabilities: ServerCapabilities;
  /** available tools */
  tools: Tool[];
  /** available prompts */
  prompts: Prompt[];
  /** available resources */
  resources: Resource[];
  /** available resource templates */
  resourceTemplates: ResourceTemplate[];
}

/**
 * creates session data object for a new session
 * @param options session data creation options
 * @returns session data object ready for storage
 */
export function createSessionData(
  options: CreateSessionDataOptions,
): SessionData {
  return {
    id: options.sessionId,
    events: [],
    userId: options.userId ?? null,
    clientInfo: options.clientInfo,
    serverInfo: options.serverInfo,
    protocolVersion: options.protocolVersion,
    capabilities: {
      client: options.clientCapabilities,
      server: options.serverCapabilities,
    },
    tools: options.tools,
    prompts: options.prompts,
    resources: options.resources,
    resourceTemplates: options.resourceTemplates,
    subscriptions: [],
  };
}
