/**
 * elicitation (user input) methods
 * @see https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation
 */

import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

export type StringSchema = {
  type: 'string';
  title?: string;
  description?: string;
  minLength?: number;
  maxLength?: number;
  format?: 'email' | 'uri' | 'date' | 'date-time';
  default?: string;
};

export type NumberSchema = {
  type: 'number' | 'integer';
  title?: string;
  description?: string;
  minimum?: number;
  maximum?: number;
  default?: number;
};

export type BooleanSchema = {
  type: 'boolean';
  title?: string;
  description?: string;
  default?: boolean;
};

export type UntitledSingleSelectEnumSchema = {
  type: 'string';
  title?: string;
  description?: string;
  enum: string[];
  default?: string;
};

export type TitledSingleSelectEnumSchema = {
  type: 'string';
  title?: string;
  description?: string;
  oneOf: Array<{
    const: string;
    title: string;
  }>;
  default?: string;
};

export type SingleSelectEnumSchema =
  | UntitledSingleSelectEnumSchema
  | TitledSingleSelectEnumSchema;

export type UntitledMultiSelectEnumSchema = {
  type: 'array';
  title?: string;
  description?: string;
  minItems?: number;
  maxItems?: number;
  items: {
    type: 'string';
    enum: string[];
  };
  default?: string[];
};

export type TitledMultiSelectEnumSchema = {
  type: 'array';
  title?: string;
  description?: string;
  minItems?: number;
  maxItems?: number;
  items: {
    anyOf: Array<{
      const: string;
      title: string;
    }>;
  };
  default?: string[];
};

export type MultiSelectEnumSchema =
  | UntitledMultiSelectEnumSchema
  | TitledMultiSelectEnumSchema;

export type LegacyTitledEnumSchema = {
  type: 'string';
  title?: string;
  description?: string;
  enum: string[];
  enumNames?: string[];
  default?: string;
};

export type EnumSchema =
  | SingleSelectEnumSchema
  | MultiSelectEnumSchema
  | LegacyTitledEnumSchema;

export type PrimitiveSchemaDefinition =
  | BooleanSchema
  | EnumSchema
  | NumberSchema
  | StringSchema;

/**
 * request from server to client for additional user input via a form interface _(since 2025-06-18)_
 * @see https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation
 */
export interface ElicitRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for elicitation requests */
  method: 'elicitation/create';
  /** parameters defining what input to collect */
  params:
    | {
        /** form mode is the default when omitted */
        mode?: 'form';
        /** message to display to the user explaining what input is needed */
        message: string;
        /** task augmentation request metadata */
        task?: {
          ttl?: number;
        };
        /** schema defining the structure of input to collect */
        requestedSchema: {
          /** definitions for each form field (primitive types only) */
          properties: Record<string, PrimitiveSchemaDefinition>;
          /** array of field names that must be provided */
          required?: string[];
          /** schema type, always 'object' for elicitation */
          type: 'object';
        };
      }
    | {
        /** URL mode for out-of-band elicitation */
        mode: 'url';
        /** message to display to the user explaining what input is needed */
        message: string;
        /** task augmentation request metadata */
        task?: {
          ttl?: number;
        };
        /** opaque identifier for this elicitation */
        elicitationId: string;
        /** URL the user should open */
        url: string;
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
  content?: Record<string, string | number | boolean | string[]>;
}
