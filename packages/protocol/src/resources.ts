/**
 * resource-related methods and types
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */

import type { Annotations, Cursor } from '#primitives';
import type { JsonRpcRequestData, JsonRpcResultData } from '#jsonrpc';

/** readable data source that servers can provide to clients _(since 2024-11-05)_ */
export type Resource = {
  /** unique uri identifying this resource */
  uri: string;
  /** human-readable name for display purposes */
  name: string;
  /** human-readable explanation of what this resource contains */
  description?: string;
  /** mime type indicating the format of the resource content */
  mimeType?: string;
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** size of raw content in bytes before encoding _(since 2025-03-26)_ */
  size?: number;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
};

/** parameterized resource definition that can generate multiple resources _(since 2024-11-05)_ */
export type ResourceTemplate = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** human-readable explanation of what resources this template generates */
  description?: string;
  /** mime type for all resources matching this template */
  mimeType?: string;
  /** programmatic identifier for this template */
  name: string;
  /** human-readable display name for ui contexts _(since 2025-06-18)_ */
  title?: string;
  /** rfc 6570 uri template for constructing resource uris */
  uriTemplate: string;
};

/** textual content from a resource that can be represented as a string _(since 2024-11-05)_ */
export type TextResourceContents = {
  /** mime type of this text content */
  mimeType?: string;
  /** actual text content of the resource */
  text: string;
  /** uri of the resource this content came from */
  uri: string;
};

/** binary content from a resource encoded as base64 _(since 2024-11-05)_ */
export type BlobResourceContents = {
  /** base64-encoded binary data */
  blob: string;
  /** mime type of this binary content */
  mimeType?: string;
  /** uri of the resource this content came from */
  uri: string;
};

/** reference to a resource or resource template for completion requests (ResourceReference until 2025-06-18) _(since 2024-11-05)_ */
export type ResourceTemplateReference = {
  /** discriminator indicating this is a resource reference */
  type: 'ref/resource';
  /** uri or uri template of the referenced resource */
  uri: string;
};

/**
 * request to discover all resources available from the server with optional pagination _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ListResourcesRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for listing resources */
  method: 'resources/list';
  /** optional parameters for pagination */
  params?: {
    /** pagination cursor to continue from previous request */
    cursor?: Cursor;
  };
}

/**
 * server response containing available resources and optional pagination continuation _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ListResourcesResult extends JsonRpcResultData {
  /** cursor for fetching additional results if more are available */
  nextCursor?: Cursor;
  /** array of resources available from this server */
  resources: Resource[];
}

/**
 * request to discover parameterized resource templates with optional pagination _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ListResourceTemplatesRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for listing resource templates */
  method: 'resources/templates/list';
  /** optional parameters for pagination */
  params?: {
    /** pagination cursor to continue from previous request */
    cursor?: Cursor;
  };
}

/**
 * server response containing available resource templates and optional pagination continuation _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ListResourceTemplatesResult extends JsonRpcResultData {
  /** cursor for fetching additional results if more are available */
  nextCursor?: Cursor;
  /** array of resource templates available from this server */
  resourceTemplates: ResourceTemplate[];
}

/**
 * request to fetch the actual content of a specific resource by its URI _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ReadResourceRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for reading resources */
  method: 'resources/read';
  /** parameters specifying which resource to read */
  params: {
    /** URI of the resource to read (server interprets the scheme) */
    uri: string;
  };
}

/**
 * server response containing the actual content of a requested resource _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface ReadResourceResult extends JsonRpcResultData {
  /** array of content blocks (text or binary) from the resource */
  contents: Array<TextResourceContents | BlobResourceContents>;
}

/**
 * request to receive notifications when a specific resource changes _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface SubscribeRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for resource subscription */
  method: 'resources/subscribe';
  /** parameters specifying which resource to watch */
  params: {
    /** URI of the resource to subscribe to for change notifications */
    uri: string;
  };
}

/**
 * request to stop receiving notifications for a previously subscribed resource _(since 2024-11-05)_
 * @see https://modelcontextprotocol.io/specification/2024-11-05/server/resources
 */
export interface UnsubscribeRequest extends JsonRpcRequestData {
  /** JSON-RPC method name for resource unsubscription */
  method: 'resources/unsubscribe';
  /** parameters specifying which subscription to cancel */
  params: {
    /** URI of the resource to stop watching for changes */
    uri: string;
  };
}
