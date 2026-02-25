import type {
  Prompt,
  Resource,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

import type { ServerRequestHandler } from '#types';

/** subset of server options needed for capability detection */
interface CapabilityParams {
  tools?: Tool[];
  prompts?: Prompt[];
  resources?: Resource[];
  handlers?: Partial<ServerRequestHandler>;
}

/**
 * creates server capabilities based on available handlers and resources
 * @param params server configuration options
 * @returns frozen server capabilities object
 */
export function createCapabilities(
  params: CapabilityParams,
): ServerCapabilities {
  return Object.freeze({
    logging: {},
    prompts: hasPromptsCapability(params) ? { listChanged: true } : undefined,
    resources: hasResourcesCapability(params)
      ? { listChanged: true, subscribe: true }
      : undefined,
    tools: hasToolsCapability(params) ? { listChanged: true } : undefined,
  });
}

/**
 * determines if server has prompts capability
 * @param params server configuration options
 * @returns true if prompts are available
 */
export function hasPromptsCapability(params: CapabilityParams): boolean {
  return !!(
    params.prompts ??
    (params.handlers?.listPrompts && params.handlers.getPrompt)
  );
}

/**
 * determines if server has resources capability
 * @param params server configuration options
 * @returns true if resources are available
 */
export function hasResourcesCapability(params: CapabilityParams): boolean {
  return !!(
    params.resources ??
    (params.handlers?.listResources && params.handlers.readResource)
  );
}

/**
 * determines if server has tools capability
 * @param params server configuration options
 * @returns true if tools are available
 */
export function hasToolsCapability(params: CapabilityParams): boolean {
  return !!(
    params.tools ??
    (params.handlers?.listTools && params.handlers.callTool)
  );
}
