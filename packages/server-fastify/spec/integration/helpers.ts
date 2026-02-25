import { request } from 'undici';

import type { IncomingHttpHeaders } from 'undici/types/header';

import type { TestServerInstance } from './setup';

/**
 * http request options for test client
 */
export interface RequestOptions {
  /** http method */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'OPTIONS';
  /** request headers */
  headers?: Record<string, string>;
  /** request body (will be JSON stringified if object) */
  body?: unknown;
  /** query parameters */
  query?: Record<string, string>;
  /** bearer token for authorization header */
  token?: string;
}

/**
 * http response from test client
 */
export interface RequestResponse<T = unknown> {
  /** http status code */
  status: number;
  /** response headers */
  headers: IncomingHttpHeaders;
  /** parsed json response body */
  data: T;
  /** raw response text */
  text: string;
}

/**
 * sse connection interface for testing
 */
export interface SSEConnection {
  /** session id for the connection */
  sessionId: string;
  /** closes the sse connection */
  close: () => void;
  /** waits for next sse event */
  nextEvent: () => Promise<SSEEvent>;
  /** checks if connection is open */
  readonly isOpen: boolean;
}

/**
 * sse event data
 */
export interface SSEEvent {
  /** event type */
  event?: string;
  /** event data payload */
  data: string;
  /** event id */
  id?: string;
}

/**
 * makes an http request to the test server using undici
 * @param server - test server instance
 * @param path - request path (relative to server base url)
 * @param options - request options
 * @returns parsed response with status, headers, and data
 */
export async function makeRequest<T = unknown>(
  server: TestServerInstance,
  path: string,
  options?: RequestOptions,
): Promise<RequestResponse<T>> {
  let url = `${server.baseUrl}${path}`;

  if (options?.query) {
    const params = new URLSearchParams(options.query);
    url += `?${params.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...options?.headers,
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let body: string | undefined;
  if (options?.body !== undefined) {
    body =
      typeof options.body === 'string'
        ? options.body
        : JSON.stringify(options.body);
  }

  const response = await request(url, {
    method: options?.method ?? 'GET',
    headers,
    body,
  });

  const text = await response.body.text();

  let data: T;
  try {
    if (text.startsWith('data:')) {
      // eslint-disable-next-line sonarjs/slow-regex -- safe for SSE parsing in tests, input limited to single SSE event
      const sseMatch = /^data:\s*([^\n]+)(?:\n\n|$)/.exec(text);
      data = sseMatch ? (JSON.parse(sseMatch[1]) as T) : ({} as T);
    } else {
      data = text ? (JSON.parse(text) as T) : ({} as T);
    }
  } catch {
    data = text as T;
  }

  return {
    status: response.statusCode,
    headers: response.headers,
    data,
    text,
  };
}

/**
 * connects to the SSE endpoint (GET /mcp) and returns connection interface
 * @param server - test server instance
 * @param sessionId - session id for the connection (required for GET /mcp)
 * @param options - request options (headers, token)
 * @returns sse connection interface
 */
export async function connectSSE(
  server: TestServerInstance,
  sessionId: string,
  options?: Pick<RequestOptions, 'headers' | 'token'>,
): Promise<SSEConnection> {
  const url = `${server.baseUrl}/mcp`;

  const headers: Record<string, string> = {
    'Accept': 'text/event-stream',
    'Mcp-Session-Id': sessionId,
    'Mcp-Protocol-Version': '2025-03-26',
    ...options?.headers,
  };

  if (options?.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await request(url, {
    method: 'GET',
    headers,
  });

  const eventQueue: SSEEvent[] = [];
  const waiters: Array<(event: SSEEvent) => void> = [];
  let isOpenRef = true;

  // eslint-disable-next-line sonarjs/cognitive-complexity -- SSE parsing requires nested conditionals for handling stream chunks, event fields, and queue management
  const parseSSEStream = async () => {
    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let event: Partial<SSEEvent> = {};

      for (const line of lines) {
        if (line.startsWith('event:')) {
          event.event = line.substring(6).trim();
        } else if (line.startsWith('data:')) {
          event.data = line.substring(5).trim();
        } else if (line.startsWith('id:')) {
          event.id = line.substring(3).trim();
        } else if (line === '') {
          if (event.data !== undefined) {
            const completeEvent: SSEEvent = {
              data: event.data,
              event: event.event,
              id: event.id,
            };

            const waiter = waiters.shift();
            if (waiter) {
              waiter(completeEvent);
            } else {
              eventQueue.push(completeEvent);
            }

            event = {};
          }
        }
      }
    }

    isOpenRef = false;
  };

  parseSSEStream().catch((error: unknown) => {
    isOpenRef = false;

    for (const waiter of waiters.splice(0)) {
      waiter({
        data: JSON.stringify({
          error: error instanceof Error ? error.message : 'stream closed',
        }),
      });
    }
  });

  return {
    sessionId,
    close: () => {
      isOpenRef = false;
    },
    nextEvent: async () => {
      return new Promise((resolve, reject) => {
        const event = eventQueue.shift();
        if (event) {
          resolve(event);

          return;
        }

        if (!isOpenRef) {
          reject(new Error('SSE connection closed'));

          return;
        }

        waiters.push(resolve);
      });
    },
    get isOpen() {
      return isOpenRef;
    },
  };
}

/**
 * waits for an sse event matching the predicate
 * @param connection - sse connection
 * @param predicate - function to test each event
 * @param timeoutMs - maximum time to wait in milliseconds
 * @returns matching sse event
 * @throws {Error} when timeout reached or connection closes
 */
export async function waitForSSEEvent(
  connection: SSEConnection,
  predicate: (event: SSEEvent) => boolean,
  timeoutMs = 5000,
): Promise<SSEEvent> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Timeout waiting for SSE event after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const eventPromise = (async () => {
    while (connection.isOpen) {
      try {
        const event = await connection.nextEvent();

        if (predicate(event)) {
          return event;
        }
      } catch (error) {
        throw new Error(
          `SSE connection closed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    throw new Error('SSE connection closed before matching event found');
  })();

  return Promise.race([eventPromise, timeoutPromise]);
}

/**
 * creates a valid access token for testing
 * @param clientId - oauth client id
 * @param scopes - token scopes
 * @returns access token string
 */
export function getValidToken(
  clientId = 'test-client',
  scopes = 'mcp',
): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);

  return `valid_token_${clientId}_${scopes.replace(/\s+/g, '_')}_${timestamp}_${random}`;
}

/**
 * creates an expired access token for testing
 * @param clientId - oauth client id
 * @returns expired access token string
 */
export function getExpiredToken(clientId = 'test-client'): string {
  const timestamp = Date.now() - 7200000;
  const random = Math.random().toString(36).substring(7);

  return `expired_token_${clientId}_${timestamp}_${random}`;
}

/**
 * asserts that response contains oauth error
 * @param response - http response to check
 * @param expectedError - expected oauth error code
 * @param expectedDescription - optional expected error description
 */
export function expectOAuthError(
  response: RequestResponse,
  expectedError: string,
  expectedDescription?: string,
): void {
  if (response.status !== 400 && response.status !== 401) {
    throw new Error(
      `Expected status 400 or 401, got ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  const data = response.data as { error?: string; error_description?: string };
  if (data.error !== expectedError) {
    throw new Error(
      `Expected error "${expectedError}", got "${data.error}": ${JSON.stringify(response.data)}`,
    );
  }

  if (expectedDescription !== undefined) {
    if (data.error_description !== expectedDescription) {
      throw new Error(
        `Expected error_description "${expectedDescription}", got "${data.error_description}"`,
      );
    }
  }
}

/**
 * asserts that response is a valid mcp json-rpc response
 * @param response - http response to check
 */
export function expectMCPResponse(response: RequestResponse): void {
  if (response.status !== 200) {
    throw new Error(
      `Expected status 200, got ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  const data = response.data as {
    jsonrpc?: string;
    id?: unknown;
    result?: unknown;
    error?: unknown;
  };

  if (data.jsonrpc !== '2.0') {
    throw new Error(
      `Expected jsonrpc "2.0", got "${data.jsonrpc}": ${JSON.stringify(response.data)}`,
    );
  }

  if (data.id === undefined && data.result === undefined) {
    throw new Error(
      `Expected id or result field in response: ${JSON.stringify(response.data)}`,
    );
  }

  if (data.error !== undefined) {
    throw new Error(
      `Expected no error field, but found: ${JSON.stringify(data.error)}`,
    );
  }
}

/**
 * asserts that response is a valid mcp json-rpc error
 * @param response - http response to check
 * @param expectedCode - expected error code
 */
export function expectMCPError(
  response: RequestResponse,
  expectedCode?: number,
): void {
  const data = response.data as {
    jsonrpc?: string;
    error?: { code?: number; message?: string };
  };

  if (data.jsonrpc !== '2.0') {
    throw new Error(
      `Expected jsonrpc "2.0", got "${data.jsonrpc}": ${JSON.stringify(response.data)}`,
    );
  }

  if (!data.error) {
    throw new Error(
      `Expected error field in response: ${JSON.stringify(response.data)}`,
    );
  }

  if (expectedCode !== undefined) {
    if (data.error.code !== expectedCode) {
      throw new Error(
        `Expected error code ${expectedCode}, got ${data.error.code}: ${JSON.stringify(data.error)}`,
      );
    }
  }
}

/**
 * waits for a condition to be true with timeout
 * @param condition - function to check
 * @param timeoutMs - maximum time to wait
 * @param intervalMs - polling interval
 * @returns true when condition met
 * @throws {Error} when timeout reached
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = await condition();

    if (result) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for condition`);
}
