/**
 * content types and message formats
 * @see https://modelcontextprotocol.io/specification/2025-06-18/basic/content
 */

import type { Annotations, Role } from '#primitives';
import type { BlobResourceContents, TextResourceContents } from '#resources';

/** textual content that can be processed directly by LLMs and displayed to users _(since 2024-11-05)_ */
export type TextContent = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** the actual text content */
  text: string;
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
};

/** resource content directly embedded within a message rather than referenced by uri _(since 2024-11-05)_ */
export type EmbeddedResource = {
  /** metadata hints for client handling */
  annotations?: Annotations;
  /** the actual resource content (text or binary) */
  resource: TextResourceContents | BlobResourceContents;
  /** content type discriminator */
  type: 'resource';
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
  /** the message content _(AudioContent since 2025-03-26)_ */
  content: TextContent | ImageContent | AudioContent;
  /** role of the message sender (user or assistant) */
  role: Role;
};

/** structured message content used throughout the MCP protocol */
export type Message = {
  /** role of the message sender */
  role: Role;
  /** message content which can be text, images, audio, or embedded resources */
  content: ContentBlock;
};
