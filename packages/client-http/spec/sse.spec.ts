import { describe, expect, it, vi } from 'vitest';

import {
  handleSSEEvent,
  handleStream,
  parseSSE,
  parseSSEField,
  processSSEStream,
} from '#sse';

import type { GetStream, ParsedSSE } from '#sse';

/**
 * creates a Server-Sent Event string with optional field overrides
 * @param overrides optional field values to override defaults
 * @param overrides.event the event type
 * @param overrides.data the event data content
 * @param overrides.id the event identifier
 * @param overrides.retry the retry interval in milliseconds
 * @returns formatted SSE event string
 */
const createSSEEvent = (overrides?: {
  event?: string;
  data?: string | string[];
  id?: string;
  retry?: number;
}): string => {
  const lines: string[] = [];

  if (overrides?.event !== undefined) {
    lines.push(`event: ${overrides.event}`);
  }

  if (overrides?.data !== undefined) {
    const dataLines = Array.isArray(overrides.data)
      ? overrides.data
      : [overrides.data];
    dataLines.forEach((line) => lines.push(`data: ${line}`));
  }

  if (overrides?.id !== undefined) {
    lines.push(`id: ${overrides.id}`);
  }

  if (overrides?.retry !== undefined) {
    lines.push(`retry: ${overrides.retry}`);
  }

  return lines.join('\n');
};

/**
 * creates a mock ReadableStream that emits text chunks
 * @param chunks array of text chunks to emit
 * @returns ReadableStream that emits the specified text chunks
 */
const createMockStream = (chunks: string[]): ReadableStream => {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream({
    start(controller) {
      const push = () => {
        if (index < chunks.length) {
          controller.enqueue(encoder.encode(chunks[index++]));
          // use microtask for immediate execution
          queueMicrotask(push);
        } else {
          controller.close();
        }
      };
      push();
    },
  });
};

describe('fn:parseSSE', () => {
  it('should parse valid sse block with all fields', () => {
    const block = createSSEEvent({
      event: 'update',
      data: '{"test": "data"}',
      id: '123',
      retry: 5000,
    });
    const expected: ParsedSSE = {
      event: 'update',
      data: '{"test": "data"}',
      id: '123',
      retry: 5000,
    };

    const result = parseSSE(block);

    expect(result).toEqual(expected);
  });

  it('should handle data field variations', () => {
    // multiple data lines joined with newlines
    const multiData = createSSEEvent({
      data: ['line1', 'line2', 'line3'],
    });
    expect(parseSSE(multiData)?.data).toBe('line1\nline2\nline3');

    // empty data
    const emptyData = createSSEEvent({ data: '' });
    expect(parseSSE(emptyData)?.data).toBe('');
  });

  it('should handle field format variations', () => {
    // fields without values default to empty/message
    const noValue = 'event:\ndata: test data';
    const result1 = parseSSE(noValue);
    expect(result1?.event).toBe('message');
    expect(result1?.data).toBe('test data');

    // fields with no colon get empty value
    const noColon = 'event\ndata: test data';
    const result2 = parseSSE(noColon);
    expect(result2?.event).toBe('message');
    expect(result2?.data).toBe('test data');

    // strip single leading space after colon
    const spaces = 'event: test-event\ndata:  data with leading spaces';
    const result3 = parseSSE(spaces);
    expect(result3?.event).toBe('test-event');
    expect(result3?.data).toBe(' data with leading spaces');
  });

  it('should handle line endings and comments', () => {
    // normalize CRLF to LF
    const crlf = 'data: line1\r\ndata: line2\r\nid: test-id';
    const result1 = parseSSE(crlf);
    expect(result1?.data).toBe('line1\nline2');
    expect(result1?.id).toBe('test-id');

    // ignore comments and empty lines
    const withComments = ': comment\ndata: test data\n: another comment';
    const result2 = parseSSE(withComments);
    expect(result2?.data).toBe('test data');
  });

  it('should validate retry values', () => {
    // valid retry values
    expect(parseSSE('retry: 0\ndata: test')?.retry).toBe(0);
    expect(parseSSE('retry: 123.456\ndata: test')?.retry).toBe(123.456);

    // invalid retry values are ignored
    expect(parseSSE('retry: -100\ndata: test')?.retry).toBeUndefined();
    expect(parseSSE('retry: not-a-number\ndata: test')?.retry).toBeUndefined();
  });

  it('should handle edge cases', () => {
    // empty string returns null
    expect(parseSSE('')).toBeNull();

    // unknown fields are ignored, return null if no meaningful content
    expect(parseSSE('unknown: field')).toBeNull();

    // ID can be empty (resets last event id)
    const emptyId = createSSEEvent({ id: '', data: 'test' });
    expect(parseSSE(emptyId)?.id).toBe('');
  });

  it('should handle minimal field combinations', () => {
    // only ID present
    const onlyId = parseSSE('id: only-id');
    expect(onlyId?.id).toBe('only-id');
    expect(onlyId?.event).toBe('message');
    expect(onlyId?.data).toBe('');

    // only retry present
    const onlyRetry = parseSSE('retry: 3000');
    expect(onlyRetry?.retry).toBe(3000);
    expect(onlyRetry?.event).toBe('message');
    expect(onlyRetry?.data).toBe('');
  });
});

describe('fn:parseSSEField', () => {
  it('should parse all field types correctly', () => {
    const sseData = { event: 'message', dataParts: [] };

    // event field
    const eventResult = parseSSEField({
      field: 'event',
      value: 'update',
      sseData,
    });
    expect(eventResult.event).toBe('update');

    // event field with empty value defaults to message
    const emptyEventResult = parseSSEField({
      field: 'event',
      value: '',
      sseData,
    });
    expect(emptyEventResult.event).toBe('message');

    // data field appends to dataParts
    const dataResult = parseSSEField({
      field: 'data',
      value: 'test',
      sseData: { ...sseData, dataParts: ['line1'] },
    });
    expect(dataResult.dataParts).toEqual(['line1', 'test']);

    // ID field including empty values
    const idResult = parseSSEField({ field: 'id', value: 'test-123', sseData });
    expect(idResult.id).toBe('test-123');

    const emptyIdResult = parseSSEField({ field: 'id', value: '', sseData });
    expect(emptyIdResult.id).toBe('');
  });

  it('should validate retry field values', () => {
    const sseData = { event: 'message', dataParts: [], retry: 1000 };

    // valid retry values
    expect(
      parseSSEField({ field: 'retry', value: '5000', sseData }).retry,
    ).toBe(5000);
    expect(parseSSEField({ field: 'retry', value: '0', sseData }).retry).toBe(
      0,
    );

    // invalid retry values are ignored (keep original)
    expect(
      parseSSEField({ field: 'retry', value: '-100', sseData }).retry,
    ).toBe(1000);
    expect(
      parseSSEField({ field: 'retry', value: 'not-a-number', sseData }).retry,
    ).toBe(1000);
  });

  it('should ignore unknown fields', () => {
    const sseData = { event: 'message', dataParts: [] };
    const result = parseSSEField({
      field: 'unknown',
      value: 'ignored',
      sseData,
    });
    expect(result).toEqual(sseData);
  });

  it('should return immutable copy of sseData', () => {
    const sseData = { event: 'message', dataParts: ['original'] };
    const result = parseSSEField({ field: 'data', value: 'new', sseData });

    // original unchanged
    expect(sseData.dataParts).toEqual(['original']);
    // result has new data
    expect(result.dataParts).toEqual(['original', 'new']);
    // different object
    expect(result).not.toBe(sseData);
  });

  it('should handle edge cases', () => {
    const sseData = { event: 'message', dataParts: [] };

    // all fields in one test for edge case coverage
    const multiResult = parseSSEField({
      field: 'event',
      value: 'test',
      sseData,
    });
    expect(multiResult.event).toBe('test');
    expect(multiResult.dataParts).toEqual([]);
  });
});

describe('fn:handleSSEEvent', () => {
  it('should process valid events and update metadata', () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const event = {
      event: 'message',
      data: '{"jsonrpc": "2.0", "method": "test"}',
      id: 'event-123',
      retry: 5000,
    };
    const metadata = { eventCount: 5 };

    const result = handleSSEEvent({ event, metadata, onMessage, log });

    expect(result.metadata.eventCount).toBe(6);
    expect(result.metadata.lastEventId).toBe('event-123');
    expect(result.metadata.serverRetryMs).toBe(5000);
    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'test' });
    expect(result.message).toEqual({ jsonrpc: '2.0', method: 'test' });
  });

  it('should handle event ID variations', () => {
    const onMessage = vi.fn();
    const metadata = { eventCount: 0, lastEventId: 'previous-id' };

    // empty ID resets lastEventId
    const emptyIdEvent = { event: 'message', data: '{"test": true}', id: '' };
    const result1 = handleSSEEvent({
      event: emptyIdEvent,
      metadata,
      onMessage,
    });
    expect(result1.metadata.lastEventId).toBeUndefined();

    // regular ID updates lastEventId
    const idEvent = { event: 'message', data: '{"test": true}', id: 'new-id' };
    const result2 = handleSSEEvent({ event: idEvent, metadata, onMessage });
    expect(result2.metadata.lastEventId).toBe('new-id');
  });

  it('should handle JSON parsing errors gracefully', () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const metadata = { eventCount: 10 };

    // invalid JSON with ID still updates metadata
    const event = { event: 'message', data: 'invalid json', id: 'still-works' };
    const result = handleSSEEvent({ event, metadata, onMessage, log });

    expect(result.metadata.eventCount).toBe(11);
    expect(result.metadata.lastEventId).toBe('still-works');
    expect(onMessage).not.toHaveBeenCalled();
    expect(result.message).toBeUndefined();
    expect(log).toHaveBeenCalledWith(
      'trace',
      'Failed to parse SSE data as JSON',
      expect.objectContaining({ data: 'invalid json' }),
    );
  });

  it('should preserve existing metadata properties', () => {
    const onMessage = vi.fn();
    const event = { event: 'message', data: '{"test": true}' };
    const metadata = {
      eventCount: 5,
      lastEventId: 'existing',
      serverRetryMs: 2000,
    };

    const result = handleSSEEvent({ event, metadata, onMessage });

    expect(result.metadata).toEqual({
      eventCount: 6,
      lastEventId: 'existing',
      serverRetryMs: 2000,
    });
  });
});

describe('fn:processSSEStream', () => {
  it('should process basic and multiple SSE events', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const event1 = createSSEEvent({
      id: 'event-1',
      data: '{"jsonrpc": "2.0", "method": "first"}',
    });
    const event2 = createSSEEvent({
      id: 'event-2',
      retry: 3000,
      data: '{"jsonrpc": "2.0", "method": "second"}',
    });
    const stream = createMockStream([event1 + '\n\n' + event2 + '\n\n']);
    const metadata = { eventCount: 5 };

    const result = await processSSEStream({ stream, metadata, onMessage, log });

    expect(result.eventCount).toBe(7);
    expect(result.lastEventId).toBe('event-2');
    expect(result.serverRetryMs).toBe(3000);
    expect(onMessage).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenNthCalledWith(1, {
      jsonrpc: '2.0',
      method: 'first',
    });
    expect(onMessage).toHaveBeenNthCalledWith(2, {
      jsonrpc: '2.0',
      method: 'second',
    });
  });

  it('should handle chunked events across boundaries', async () => {
    const onMessage = vi.fn();
    const eventData = createSSEEvent({
      data: '{"jsonrpc": "2.0", "method": "chunked"}',
    });
    // split event across multiple chunks
    const chunks = [
      eventData.slice(0, 10),
      eventData.slice(10) + '\n',
      '\n', // complete the boundary
    ];
    const stream = createMockStream(chunks);
    const metadata = { eventCount: 0 };

    const result = await processSSEStream({ stream, metadata, onMessage });

    expect(result.eventCount).toBe(1);
    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'chunked',
    });
  });

  it('should handle JSON errors and continue processing', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const invalidEvent = createSSEEvent({ data: 'invalid json' });
    const validEvent = createSSEEvent({
      data: '{"jsonrpc": "2.0", "method": "valid"}',
    });
    const stream = createMockStream([
      invalidEvent + '\n\n' + validEvent + '\n\n',
    ]);
    const metadata = { eventCount: 0 };

    const result = await processSSEStream({ stream, metadata, onMessage, log });

    expect(result.eventCount).toBe(2);
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'valid' });
  });

  it('should handle stream errors', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const erroringStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('Read error'));
      },
    });
    const metadata = { eventCount: 0 };

    await expect(
      processSSEStream({ stream: erroringStream, metadata, onMessage, log }),
    ).rejects.toThrow('Read error');

    expect(log).toHaveBeenCalledWith(
      'warn',
      'Stream read error',
      expect.objectContaining({ error: 'Read error', eventCount: 0 }),
    );
  });

  it('should handle incomplete events and stream endings', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();

    // test normal ending
    const normalStream = createMockStream(['data: test\n\n']);
    const result1 = await processSSEStream({
      stream: normalStream,
      metadata: { eventCount: 0 },
      onMessage,
      log,
    });
    expect(result1.eventCount).toBe(1);
    expect(log).toHaveBeenCalledWith(
      'debug',
      'Stream ended normally',
      expect.any(Object),
    );

    // test incomplete event (no double newline)
    const incompleteEvent = createSSEEvent({
      data: '{"jsonrpc": "2.0", "method": "incomplete"}',
    });
    const incompleteStream = createMockStream([incompleteEvent]); // no \n\n
    const result2 = await processSSEStream({
      stream: incompleteStream,
      metadata: { eventCount: 0 },
      onMessage: vi.fn(),
    });
    expect(result2.eventCount).toBe(0);
  });
});

describe('fn:handleStream', () => {
  it('should process SSE events from initial stream', async () => {
    const onMessage = vi.fn();
    const eventData = createSSEEvent({
      id: 'event-123',
      retry: 100,
      data: '{"jsonrpc": "2.0", "method": "test"}',
    });
    const stream = createMockStream([eventData + '\n\n']);

    await handleStream({
      getStream: async ({ attempt }) => (attempt ? null : stream),
      onMessage,
    });

    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'test' });
  });

  it('should handle reconnection and retry logic', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const eventData = createSSEEvent({
      id: 'event-456',
      data: '{"jsonrpc": "2.0", "method": "reconnected"}',
    });

    const getStream = vi.fn<GetStream>(async ({ attempt }) => {
      if (attempt === 0) {
        // first attempt fails
        return new ReadableStream({
          start(controller) {
            controller.error(new Error('Connection failed'));
          },
        });
      } else if (attempt === 1) {
        // second attempt succeeds
        return createMockStream([eventData + '\n\n']);
      }

      return null; // stop after success
    });

    await handleStream({
      getStream,
      onMessage,
      log,
      maxRetries: 2,
      maxDelayMs: 100,
    });

    expect(getStream).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      method: 'reconnected',
    });
    expect(log).toHaveBeenCalledWith(
      'info',
      'Starting SSE stream handler',
      expect.any(Object),
    );
  });

  it('should handle abort signal scenarios', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();
    const abortController = new AbortController();

    // test immediate abort
    abortController.abort();

    await handleStream({
      getStream: async ({ attempt }) => (attempt ? null : createMockStream([])),
      onMessage,
      abortSignal: abortController.signal,
      log,
      maxRetries: 0,
    });

    expect(onMessage).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'info',
      'Stream handler aborted by signal',
    );

    // test abort during processing
    const controller2 = new AbortController();
    const handlerPromise = handleStream({
      getStream: async ({ attempt }) => (attempt ? null : createMockStream([])),
      onMessage: vi.fn(),
      abortSignal: controller2.signal,
      maxRetries: 2,
    });

    setTimeout(() => controller2.abort(), 10);
    await handlerPromise;
  });

  it('should handle getStream returning null to stop reconnection', async () => {
    const onMessage = vi.fn();
    const failingStream = new ReadableStream({
      start(controller) {
        controller.error(new Error('Network failure'));
      },
    });

    const getStream = vi.fn<GetStream>(async ({ attempt }) => {
      if (attempt === 0) {
        return failingStream;
      }

      return null; // stop reconnection
    });

    await handleStream({ getStream, onMessage, maxRetries: 1 });

    expect(getStream).toHaveBeenCalledTimes(2);
  });

  it('should handle various error scenarios', async () => {
    const onMessage = vi.fn();
    const log = vi.fn();

    // test stream read error
    const erroringStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: {"jsonrpc": "2.0"}\n\n'));
        controller.error(new Error('Read error'));
      },
    });

    await handleStream({
      getStream: async ({ attempt }) => (attempt ? null : erroringStream),
      onMessage,
      log,
      maxRetries: 0,
    });

    expect(log).toHaveBeenCalledWith(
      'info',
      'Starting SSE stream handler',
      expect.any(Object),
    );
    expect(log).toHaveBeenCalledWith('info', 'SSE stream handler completed');
  });

  it('should handle JSON parsing errors and continue processing', async () => {
    const onMessage = vi.fn();
    const validData = createSSEEvent({
      data: '{"jsonrpc": "2.0", "method": "valid"}',
    });
    const invalidData = createSSEEvent({ data: 'invalid json' });
    const stream = createMockStream([
      invalidData + '\n\n' + validData + '\n\n',
    ]);

    await handleStream({
      getStream: async ({ attempt }) => (attempt ? null : stream),
      onMessage,
    });

    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage).toHaveBeenCalledWith({ jsonrpc: '2.0', method: 'valid' });
  });
});
