import type { Role } from '#primitives';
import type {
  AudioContent,
  ImageContent,
  SamplingMessage,
  TextContent,
} from '#content';
import type { JsonValue } from '#json';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

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

/**
 * request from server to client for LLM message generation with human oversight _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/sampling
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
    /** strings that should stop generation when encountered */
    stopSequences?: string[];
    /** optional system prompt to use for generation */
    systemPrompt?: string;
    /** sampling temperature for randomness control */
    temperature?: number;
  };
}

/**
 * client response containing the generated message after user approval _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/client/sampling
 */
export interface CreateMessageResult extends JsonRpcResultData {
  /** the generated message content _(AudioContent since 2025-03-26)_ */
  content: TextContent | ImageContent | AudioContent;
  /** name of the model that generated the response */
  model: string;
  /** role of the generated message */
  role: Role;
  /** reason why generation stopped (if known) */
  stopReason?: string;
}
