/**
 * elicitation (user input) methods
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
 */

import type { PrimitiveSchemaDefinition } from '#primitives';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/**
 * request from server to client for additional user input via a form interface _(since 2025-06-18)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
 */
export interface ElicitRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for elicitation requests */
  method: 'elicitation/create';
  /** parameters defining what input to collect */
  params: {
    /** message to display to the user explaining what input is needed */
    message: string;
    /** schema defining the structure of input to collect */
    requestedSchema: {
      /** definitions for each form field (primitive types only) */
      properties: Record<string, PrimitiveSchemaDefinition>;
      /** array of field names that must be provided */
      required?: string[];
      /** schema type, always 'object' for elicitation */
      type: 'object';
    };
  };
}

/**
 * client response containing user's decision and form data from elicitation request _(since 2025-06-18)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
 */
export interface ElicitResult extends JsonRpcResultData {
  /** user's response to the elicitation request */
  action: 'accept' | 'decline' | 'cancel';
  /** form data submitted by user (only present when action is 'accept') */
  content?: Record<string, string | number | boolean>;
}
