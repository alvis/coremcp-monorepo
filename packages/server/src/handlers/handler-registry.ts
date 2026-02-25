import { handleCallTool } from './call-tool';
import { handleComplete } from './complete';
import { handleGetPrompt } from './get-prompt';
import { handleInitialize } from './initialize';
import { handleListPrompts } from './list-prompts';
import { handleListResources } from './list-resources';
import { handleListResourceTemplates } from './list-resource-templates';
import { handleListTools } from './list-tools';
import { handleReadResource } from './read-resource';
import { handleSetLevel } from './set-level';
import { handleSubscribe } from './subscribe';
import { handleUnsubscribe } from './unsubscribe';

import type { McpClientRequest } from '@coremcp/protocol';

import type { ServerRequestHandler } from '#types';

/** mapping of mcp method names to their corresponding handler method names */
export const methodToHandlerMap: Record<
  Exclude<McpClientRequest['method'], 'ping'>,
  keyof ServerRequestHandler
> &
  Record<string, string | undefined> = {
  'initialize': 'initialize',
  'resources/list': 'listResources',
  'resources/templates/list': 'listResourceTemplates',
  'resources/read': 'readResource',
  'resources/subscribe': 'subscribe',
  'resources/unsubscribe': 'unsubscribe',
  'prompts/list': 'listPrompts',
  'prompts/get': 'getPrompt',
  'tools/list': 'listTools',
  'tools/call': 'callTool',
  'completion/complete': 'complete',
  'logging/setLevel': 'setLevel',
};

/**
 * resolves server handler functions with optional overrides
 * @param handlers optional partial handler implementations to override defaults
 * @returns complete server handler object with all required methods
 */
export function resolveHandlers(
  handlers: Partial<ServerRequestHandler> = {},
): ServerRequestHandler {
  return {
    callTool: handlers.callTool ?? handleCallTool,
    complete: handlers.complete ?? handleComplete,
    getPrompt: handlers.getPrompt ?? handleGetPrompt,
    initialize: handlers.initialize ?? handleInitialize,
    listPrompts: handlers.listPrompts ?? handleListPrompts,
    listResources: handlers.listResources ?? handleListResources,
    listResourceTemplates:
      handlers.listResourceTemplates ?? handleListResourceTemplates,
    listTools: handlers.listTools ?? handleListTools,
    readResource: handlers.readResource ?? handleReadResource,
    setLevel: handlers.setLevel ?? handleSetLevel,
    subscribe: handlers.subscribe ?? handleSubscribe,
    unsubscribe: handlers.unsubscribe ?? handleUnsubscribe,
  };
}
