/**
 * content types and message formats
 * @see https://modelcontextprotocol.io/specification/2025-11-25/basic/content
 */

import type { Annotations, Role } from '#primitives';
import type { BlobResourceContents, TextResourceContents } from '#resources';
import type { JsonifibleObject } from '#json';

/** textual content that can be processed directly by LLMs and displayed to users _(since 2024-11-05)_ */
export type TextContent = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** the actual text content */
  text: string;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
  /** content type discriminator */
  type: 'text';
};

/** visual content encoded as base64 that can be displayed or processed by vision models _(since 2024-11-05)_ */
export type ImageContent = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** base64-encoded image data */
  data: string;
  /** mime type of the image (providers may support different formats) */
  mimeType: string;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
  /** content type discriminator */
  type: 'image';
};

/** audio content encoded as base64 that can be played or processed by audio models _(since 2025-03-26)_ */
export type AudioContent = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** base64-encoded audio data */
  data: string;
  /** mime type of the audio (providers may support different formats) */
  mimeType: string;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
  /** content type discriminator */
  type: 'audio';
};

/** reference to a resource that the server can read, included in prompts or tool results _(since 2025-06-18)_ */
export type ResourceLink = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** human-readable explanation of what this resource contains */
  description?: string;
  /** mime type of the linked resource */
  mimeType?: string;
  /** programmatic identifier for this resource */
  name: string;
  /** size of raw content in bytes before encoding */
  size?: number;
  /** human-readable display name for UI contexts */
  title?: string;
  /** content type discriminator */
  type: 'resource_link';
  /** URI of the resource being referenced */
  uri: string;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
};

/** resource content directly embedded within a message rather than referenced by uri _(since 2024-11-05)_ */
export type EmbeddedResource = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** the actual resource content (text or binary) */
  resource: TextResourceContents | BlobResourceContents;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
  /** content type discriminator */
  type: 'resource';
};

/** request from the assistant to call a tool during sampling _(since 2025-11-25)_ */
export type ToolUseContent = {
  /** content type discriminator */
  type: 'tool_use';
  /** unique identifier used to match tool results */
  id: string;
  /** tool name to call */
  name: string;
  /** input arguments for the tool */
  input: JsonifibleObject;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
};

/** result of a prior tool use provided back to the model _(since 2025-11-25)_ */
export type ToolResultContent = {
  /** content type discriminator */
  type: 'tool_result';
  /** identifier of the related tool use */
  toolUseId: string;
  /** unstructured result content */
  content: ContentBlock[];
  /** structured tool output */
  structuredContent?: JsonifibleObject;
  /** whether the tool use resulted in an error */
  isError?: boolean;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
};

/** union of all possible content types that can appear in messages _(since 2024-11-05)_ */
export type ContentBlock =
  | AudioContent // _(since 2025-03-26)_
  | EmbeddedResource
  | ImageContent
  | ResourceLink // _(since 2025-06-18)_
  | TextContent;

/** message structure used for LLM sampling requests containing role and content _(since 2024-11-05)_ */
export type SamplingMessage = {
  /** the message content */
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
  /** role of the message sender (user or assistant) */
  role: Role;
  /** protocol metadata for preserving provider details */
  _meta?: JsonifibleObject;
};

/** structured message content used throughout the MCP protocol */
export type Message = {
  /** role of the message sender */
  role: Role;
  /** message content which can be text, images, audio, or embedded resources */
  content: ContentBlock;
};
