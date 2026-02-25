import { MockAgent, setGlobalDispatcher } from 'undici';
import { vi } from 'vitest';

import type { MockInterceptor } from 'undici/types/mock-interceptor';

/** HTTP request context information for testing verification */
export interface HttpContext {
  /** request URL including origin, pathname and search parameters */
  url: string;
  /** HTTP method used for the request */
  method: string;
  /** HTTP headers sent with the request */
  headers: Record<string, string>;
}

const mockAgent = new MockAgent();

setGlobalDispatcher(mockAgent);
mockAgent.disableNetConnect();

/**
 * normalizes headers to plain object format for testing
 * @param headers headers in various formats to normalize
 * @returns normalized headers as plain object
 */
function normalizeHeaders(
  headers?: Headers | Record<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};

  if (!headers) {
    return result;
  }

  const source = headers instanceof Headers ? headers : new Headers(headers);
  source.forEach((value, key) => {
    result[key.toLowerCase()] = value;
  });

  return result;
}

/** mock function to record HTTP request contexts for testing verification */
export const captureRequest = vi.fn<(context: HttpContext) => void>();

/**
 * extracts HTTP context information from mock interceptor callback options
 * @param context mock response callback options
 * @returns extracted HTTP context for testing
 */
export function extractHttpContext(
  context: MockInterceptor.MockResponseCallbackOptions,
): HttpContext {
  const origin = context.origin;
  const path = context.path;

  return {
    url: `${origin}${path}`,
    method: context.method.toUpperCase(),
    headers: normalizeHeaders(context.headers),
  };
}

/**
 * intercepts HTTP requests for OAuth metadata testing
 * @param url target URL to intercept
 * @param options optional mock interceptor configuration
 * @returns configured MockInterceptor instance
 */
export function intercept(
  url: string,
  options?: Partial<MockInterceptor.Options>,
): MockInterceptor {
  const endpoint = new URL(url);

  return mockAgent.get(endpoint.origin).intercept({
    method: options?.method ?? 'GET',
    path: `${endpoint.pathname || '/'}${endpoint.search}`,
    ...options,
  });
}

/**
 * configures mock HTTP response with JSON data and request recording
 * @param url target URL to mock
 * @param data response data to serialize as JSON
 * @param options optional response configuration
 * @param options.statusCode HTTP status code to return
 * @param options.headers HTTP headers to include
 * @param options.method HTTP method to intercept
 */
export function mockJsonResponse(
  url: string,
  data: unknown,
  options?: {
    statusCode?: number;
    headers?: Record<string, string>;
    method?: string;
  },
): void {
  return mockRawResponse(url, {
    ...options,
    headers: { ...options?.headers, 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
}

/**
 * configures mock HTTP response with raw body content and request recording
 * @param url target URL to mock
 * @param options response configuration options
 * @param options.statusCode HTTP status code to return
 * @param options.headers HTTP headers to include
 * @param options.body raw response body content
 * @param options.method HTTP method to intercept
 */
export function mockRawResponse(
  url: string,
  options?: {
    statusCode?: number;
    headers?: Record<string, string>;
    body?: string;
    method?: string;
  },
): void {
  const { statusCode = 200, body = '', headers = {}, method } = { ...options };

  intercept(url, method ? { method } : undefined)
    .reply((context) => {
      captureRequest(extractHttpContext(context));

      return {
        statusCode,
        data: body,
        responseOptions: { headers },
      };
    })
    .times(1);
}

/**
 * configures mock HTTP response that throws an error
 * @param url target URL to mock
 * @param error error to throw when request is made
 */
export function mockErrorResponse(url: string, error: Error): void {
  intercept(url)
    .reply((context) => {
      captureRequest(extractHttpContext(context));

      throw error;
    })
    .times(1);
}
