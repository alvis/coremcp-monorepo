/**
 * completion-related methods
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/completion
 */

import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';
import type { PromptReference } from '#prompts';
import type { ResourceTemplateReference } from '#resources';

/**
 * request for autocompletion suggestions for prompt or resource template arguments _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/completion
 */
export interface CompleteRequest extends JsonRpcRequestData {
  /** json-rpc method name for completion requests */
  method: 'completion/complete';
  /** parameters specifying what to complete */
  params: {
    /** the specific argument to provide completions for */
    argument: {
      /** name of the argument being completed */
      name: string;
      /** current partial value to match against */
      value: string;
    };
    /** additional context for generating completions _(since 2025-06-18)_ */
    context?: {
      /** previously resolved argument values */
      arguments?: Record<string, string>;
    };
    /** reference to the prompt or resource template being completed */
    ref: PromptReference | ResourceTemplateReference;
  };
}

/**
 * server response containing completion suggestions for the requested argument _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/completion
 */
export interface CompleteResult extends JsonRpcResultData {
  /** completion results and metadata */
  completion: {
    /** whether additional completions exist beyond those returned */
    hasMore?: boolean;
    /** total number of possible completions if known */
    total?: number;
    /** array of completion suggestions (limited to 100 items) */
    values: string[];
  };
}
