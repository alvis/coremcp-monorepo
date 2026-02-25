import type { JsonRpcMessage } from '@coremcp/protocol';

/** context information about a client connection */
export interface ConnectionContext {
  /** unique identifier for this connection channel */
  channelId: string;
  /** the transport type used for this connection */
  transport: string;
  /** abort signal from the client */
  abortSignal: AbortSignal;
  /** a promise that will be resolved when the connection is closed */
  waitUntilClosed: Promise<void>;
  /** send a message to the other party */
  write: (message: JsonRpcMessage) => Promise<void>;
  /** protocol version extracted from the Mcp-Protocol-Version header (default: the latest version) */
  protocolVersion?: string;

  /** user identified who make the connection */
  userId?: string;
  /** session id extracted from the Mcp-Session-Id header */
  sessionId?: string;
  /** last event id extracted from the last-event-id header */
  lastEventId?: string;
}
