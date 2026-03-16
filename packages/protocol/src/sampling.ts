import type {
  AudioContent,
  ImageContent,
  SamplingMessage,
  TextContent,
  ToolResultContent,
  ToolUseContent,
} from '#content';
import type { JsonValue } from '#json';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';
import type { Role } from '#primitives';
import type { Tool } from '#tools';

/** hint for model selection with flexible matching rules _(since 2024-11-05)_ */
export type ModelHint = {
  /** model name or partial name for substring matching */
  name?: string;
};

/** server preferences for llm model selection (all advisory, client may ignore) _(since 2024-11-05)_ */
export type ModelPreferences = {
  /** importance of cost optimization (0=not important, 1=most important) */
  costPriority?: number;
  /** ordered list of model selection hints (first match takes precedence) */
  hints?: ModelHint[];
  /** importance of model capability and intelligence (0=not important, 1=most important) */
  intelligencePriority?: number;
  /** importance of response latency (0=not important, 1=most important) */
  speedPriority?: number;
};

/** controls tool selection behavior for sampling requests _(since 2025-11-25)_ */
export type ToolChoice = {
  /** controls whether the model may or must use tools */
  mode?: 'auto' | 'required' | 'none';
};

/**
 * request from server to client for LLM message generation with human oversight _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
 */
export interface CreateMessageRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for sampling requests */
  method: 'sampling/createMessage';
  /** parameters controlling the LLM generation */
  params: {
    /** whether to include context from other MCP servers */
    includeContext?: 'allServers' | 'none' | 'thisServer';
    /** maximum number of tokens to generate */
    maxTokens: number;
    /** conversation history for the LLM */
    messages: SamplingMessage[];
    /** provider-specific metadata to pass through */
    metadata?: Record<string, JsonValue>;
    /** server's preferences for model selection */
    modelPreferences?: ModelPreferences;
    /** task augmentation request metadata */
    task?: {
      ttl?: number;
    };
    /** strings that should stop generation when encountered */
    stopSequences?: string[];
    /** optional system prompt to use for generation */
    systemPrompt?: string;
    /** sampling temperature for randomness control */
    temperature?: number;
    /** tools the model may use during generation */
    tools?: Tool[];
    /** controls how the model uses tools */
    toolChoice?: ToolChoice;
  };
}

/**
 * client response containing the generated message after user approval _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2025-11-25/client/sampling
 */
export interface CreateMessageResult extends JsonRpcResultData {
  /** the generated message content */
  content:
    | TextContent
    | ImageContent
    | AudioContent
    | ToolUseContent
    | ToolResultContent
    | Array<
        | TextContent
        | ImageContent
        | AudioContent
        | ToolUseContent
        | ToolResultContent
      >;
  /** name of the model that generated the response */
  model: string;
  /** role of the generated message */
  role: Role;
  /** reason why generation stopped (if known) */
  stopReason?: 'endTurn' | 'stopSequence' | 'maxTokens' | 'toolUse' | string;
}
