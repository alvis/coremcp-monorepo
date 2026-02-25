import { jsonifyError } from '@coremcp/core';

import { NonRetryableError, retry } from '#retry';

import type { OnMessage } from '@coremcp/client/connector';
import type { Log } from '@coremcp/core';
import type { JsonRpcMessage } from '@coremcp/protocol';

/** function to obtain readable stream for SSE processing */
export type GetStream = (params: {
  /** current attempt number for retry logic */
  attempt: number;
  /** optional last event ID for resuming streams */
  lastEventId?: string;
}) => Promise<ReadableStream | null>;

/** parsed Server-Sent Events data structure */
export interface ParsedSSE {
  /** event type, defaults to "message" */
  event: string;
  /** event data, joined with newlines if multiple data lines */
  data: string;
  /** optional event ID for stream resumption */
  id?: string;
  /** optional reconnection interval hint from server in milliseconds */
  retry?: number;
}

/** metadata tracking for SSE stream processing */
export interface StreamMetadata {
  /** last received event ID for stream resumption */
  lastEventId?: string;
  /** server-suggested retry interval in milliseconds */
  serverRetryMs?: number;
  /** total number of events processed */
  eventCount: number;
}

/** result of processing single SSE event */
export interface SSEEventResult {
  /** updated stream metadata */
  metadata: StreamMetadata;
  /** parsed JSON-RPC message if valid */
  message?: JsonRpcMessage;
}

/** maximum delay in milliseconds between SSE reconnection attempts */
export const DEFAULT_MAX_DELAY_MS = 30_000;

/** default maximum retry attempts for SSE connections (infinite for persistent connection) */
export const DEFAULT_SSE_MAX_RETRIES = Infinity; // keep retrying until explicitly aborted

/**
 * processes SSE streams with automatic reconnection and retry logic
 *
 * handles continuous stream processing with exponential backoff,
 * automatic reconnection on failures, and graceful shutdown support
 * @param params stream handling parameters
 * @param params.getStream function to obtain readable stream for processing
 * @param params.onMessage callback function for processing messages
 * @param params.abortSignal external abort signal to stop reconnect loop
 * @param params.log optional logging function
 * @param params.maxDelayMs maximum backoff delay in milliseconds
 * @param params.maxRetries maximum consecutive reconnect attempts
 * @returns promise resolving when stream processing complete
 */
export async function handleStream(params: {
  getStream: GetStream;
  onMessage: OnMessage;
  /** external abort signal to stop the reconnect loop */
  abortSignal?: AbortSignal;
  log?: Log;
  /** maximum backoff delay (ms) */
  maxDelayMs?: number;
  /** maximum number of consecutive reconnect attempts before giving up; default Infinity */
  maxRetries?: number;
}): Promise<void> {
  const { getStream, onMessage, abortSignal, log } = params;
  const {
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    maxRetries = DEFAULT_SSE_MAX_RETRIES,
  } = params;

  log?.('info', 'Starting SSE stream handler', { maxDelayMs, maxRetries });

  let metadata: StreamMetadata = { eventCount: 0 };

  await retry(
    async ({ attempt, abortSignal }) => {
      const { lastEventId } = metadata;

      if (abortSignal.aborted) {
        throw new Error('Aborted');
      }

      // Try to get a new stream
      const stream = await getStream({ attempt, lastEventId });

      if (!stream) {
        throw new NonRetryableError('Stop reconnect as null stream returned');
      }

      // Process the new stream &  Update current metadata for next iteration
      metadata = await processSSEStream({ stream, metadata, onMessage, log });
    },
    {
      name: 'SSE Stream',
      maxRetries,
      abortSignal,
      log,
      onRetry: (meta) => {
        log?.('info', 'Attempting reconnection', {
          attempt: meta.attempt,
          maxRetries,
          lastEventId: metadata.lastEventId,
          serverRetryMs: metadata.serverRetryMs,
        });
      },
    },
  ).catch((error) =>
    abortSignal?.aborted
      ? log?.('info', 'Stream handler aborted by signal')
      : log?.('error', 'SSE stream handler failed after retries', {
          error: jsonifyError(error),
          lastEventId: metadata.lastEventId,
        }),
  );

  log?.('info', 'SSE stream handler completed');
}

/**
 * processes single SSE stream to completion
 *
 * reads stream chunks, parses SSE events, and processes JSON-RPC messages
 * while maintaining metadata for reconnection context
 * @param params parameters object
 * @param params.stream the ReadableStream to process
 * @param params.metadata current stream metadata
 * @param params.onMessage callback for processed messages
 * @param params.log optional logger
 * @returns final metadata when stream ends or errors
 */
export async function processSSEStream(params: {
  stream: ReadableStream;
  metadata: StreamMetadata;
  onMessage: OnMessage;
  log?: Log;
}): Promise<StreamMetadata> {
  const { stream, metadata, onMessage, log } = params;

  log?.('debug', 'Processing SSE stream', {
    hasLastEventId: !!metadata.lastEventId,
  });

  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  let buffer = '';
  let currentMetadata = { ...metadata };

  try {
    // read until this stream ends
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        log?.('debug', 'Stream ended normally', {
          eventCount: currentMetadata.eventCount,
          lastEventId: currentMetadata.lastEventId,
        });
        break;
      }
      buffer += value;
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const rawEvent = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const reply = parseSSE(rawEvent);
        if (reply) {
          const result = handleSSEEvent({
            event: reply,
            metadata: currentMetadata,
            onMessage,
            log,
          });
          currentMetadata = result.metadata;
        }
      }
    }
  } catch (error) {
    // handle network or reader errors
    log?.('warn', 'Stream read error', {
      error: error instanceof Error ? error.message : String(error),
      eventCount: currentMetadata.eventCount,
      lastEventId: currentMetadata.lastEventId,
    });
    throw error;
  }

  return currentMetadata;
}

/**
 * handles single SSE event, updating metadata and processing JSON messages
 *
 * processes event metadata, updates stream state, and attempts JSON parsing
 * for valid JSON-RPC messages while maintaining error resilience
 * @param params parameters object
 * @param params.event parsed SSE event
 * @param params.metadata current stream metadata
 * @param params.onMessage callback for processed messages
 * @param params.log optional logger
 * @returns updated metadata and parsed message if valid
 */
export function handleSSEEvent(params: {
  event: ParsedSSE;
  metadata: StreamMetadata;
  onMessage: OnMessage;
  log?: Log;
}): SSEEventResult {
  const { event, metadata, onMessage, log } = params;
  const updatedMetadata = { ...metadata, eventCount: metadata.eventCount + 1 };

  log?.('trace', 'Received SSE event', {
    event: event.event,
    hasData: !!event.data,
    id: event.id,
    retry: event.retry,
  });

  // update lastEventId if present
  if (event.id !== undefined) {
    updatedMetadata.lastEventId = event.id || undefined; // empty id resets
    log?.('trace', 'Updated lastEventId', {
      lastEventId: updatedMetadata.lastEventId,
    });
  }

  // update serverRetryMs if present
  if (event.retry !== undefined) {
    updatedMetadata.serverRetryMs = event.retry;
    log?.('debug', 'Server requested retry interval', {
      serverRetryMs: updatedMetadata.serverRetryMs,
    });
  }

  // parse and process JSON message
  try {
    const message = JSON.parse(event.data) as JsonRpcMessage;
    onMessage(message);

    return { metadata: updatedMetadata, message };
  } catch (error) {
    // log parse errors but continue processing
    log?.('trace', 'Failed to parse SSE data as JSON', {
      error: jsonifyError(error),
      data: event.data,
    });

    return { metadata: updatedMetadata };
  }
}

/**
 * parses single SSE block terminated by blank line
 *
 * processes SSE format with proper handling of:
 * - multi-line data fields joined with newlines
 * - comment lines starting with colon
 * - leading space removal after field separators
 * - event ID and retry hint extraction
 * @param block the SSE block string to parse
 * @returns parsed SSE event data or null if no meaningful content
 * @example
 * ```typescript
 * const event = parseSSE('id: 123\nevent: update\ndata: {"x":1}\ndata: {"y":2}');
 * // returns: { id: '123', event: 'update', data: '{"x":1}\n{"y":2}' }
 * ```
 */
export function parseSSE(block: string): ParsedSSE | null {
  if (!block) {
    return null;
  }

  // normalize CRLF to LF and split into lines
  const lines = block.replace(/\r\n/g, '\n').split('\n');

  let sseData: {
    event: string;
    dataParts: string[];
    id?: string;
    retry?: number;
  } = {
    event: 'message',
    dataParts: [],
  };

  for (const rawLine of lines) {
    const line = rawLine; // keep as-is except for checks below
    if (line === '' || line.startsWith(':')) {
      // empty line or comment/heartbeat - ignore (block terminator handled by caller)
      continue;
    }

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    // if colon present, value is everything after it; strip leading space if present
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) {
      value = value.slice(1);
    }

    sseData = parseSSEField({ field, value, sseData });
  }

  // return null if no meaningful content found
  if (
    !sseData.dataParts.length &&
    !sseData.id &&
    !sseData.retry &&
    sseData.event === 'message'
  ) {
    return null;
  }

  return {
    event: sseData.event,
    data: sseData.dataParts.join('\n'),
    id: sseData.id,
    retry: sseData.retry,
  };
}

/**
 * parses field value and returns updated SSE data as pure function
 *
 * handles all SSE field types including event, data, id, and retry
 * with proper validation and immutable updates
 * @param params parameters object
 * @param params.field the field name (event, data, id, retry)
 * @param params.value the field value
 * @param params.sseData object containing current SSE data
 * @param params.sseData.event current event type
 * @param params.sseData.dataParts array of data parts
 * @param params.sseData.id event ID
 * @param params.sseData.retry retry interval in milliseconds
 * @returns updated SSE data object (new object, not mutated)
 */
export function parseSSEField(params: {
  field: string;
  value: string;
  sseData: { event: string; dataParts: string[]; id?: string; retry?: number };
}): { event: string; dataParts: string[]; id?: string; retry?: number } {
  const { field, value, sseData } = params;

  switch (field) {
    case 'event':
      return { ...sseData, event: value || 'message' };

    case 'data':
      return { ...sseData, dataParts: [...sseData.dataParts, value] };

    case 'id':
      // per SSE spec, empty id resets the last event id
      return { ...sseData, id: value };

    case 'retry': {
      const n = Number(value);
      if (Number.isFinite(n) && n >= 0) {
        return { ...sseData, retry: n };
      }

      return sseData;
    }
    default:
      // unknown field - ignore per SSE spec
      return sseData;
  }
}
