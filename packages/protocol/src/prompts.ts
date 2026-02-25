/**
 * prompt-related methods and types
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/prompts
 */

import type { Cursor, Role } from '#primitives';
import type { ContentBlock } from '#content';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/** reusable prompt template that servers can provide to clients _(since 2024-11-05)_ */
export type Prompt = {
  /** list of parameters this prompt accepts for customization */
  arguments?: PromptArgument[];
  /** human-readable explanation of what this prompt does */
  description?: string;
  /** programmatic identifier for this prompt */
  name: string;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
};

/** parameter definition for a prompt template _(since 2024-11-05)_ */
export type PromptArgument = {
  /** human-readable explanation of what this argument controls */
  description?: string;
  /** programmatic identifier for this argument */
  name: string;
  /** whether this argument must be provided when using the prompt */
  required?: boolean;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
};

/** message within a prompt template that can contain dynamic content and resources _(since 2024-11-05)_ */
export type PromptMessage = {
  /** the message content which may include embedded resources */
  content: ContentBlock;
  /** who this message is from (user or assistant) */
  role: Role;
};

/** reference to a prompt template for completion requests _(since 2025-03-26)_ */
export type PromptReference = {
  /** programmatic identifier of the referenced prompt */
  name: string;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
  /** discriminator indicating this is a prompt reference */
  type: 'ref/prompt';
};

/**
 * request to discover all prompt templates available from the server with optional pagination _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#listing-prompts
 */
export interface ListPromptsRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for listing prompts */
  method: 'prompts/list';
  /** optional parameters for pagination */
  params?: {
    /** pagination cursor to continue from previous request */
    cursor?: Cursor;
  };
}

/**
 * server response containing available prompt templates and optional pagination continuation _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#listing-prompts
 */
export interface ListPromptsResult extends JsonRpcResultData {
  /** cursor for fetching additional results if more are available */
  nextCursor?: Cursor;
  /** array of prompt templates available from this server */
  prompts: Prompt[];
}

/**
 * request to retrieve a specific prompt template with optional argument substitution _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#getting-a-prompt
 */
export interface GetPromptRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for getting prompts */
  method: 'prompts/get';
  /** parameters specifying which prompt to retrieve */
  params: {
    /** key-value pairs for prompt argument substitution */
    arguments?: Record<string, string>;
    /** programmatic identifier of the prompt to retrieve */
    name: string;
  };
}

/**
 * server response containing the processed prompt with arguments applied _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/server/prompts#getting-a-prompt
 */
export interface GetPromptResult extends JsonRpcResultData {
  /** human-readable explanation of what this prompt accomplishes */
  description?: string;
  /** sequence of messages that make up this prompt */
  messages: PromptMessage[];
}
