/**
 * undici MockAgent utilities for HTTP edge-case simulation
 *
 * provides per-test network interception helpers for simulating
 * connection errors, timeouts, and mid-stream aborts in e2e tests.
 */

import { MockAgent, fetch as undiciFetch } from 'undici';

// FUNCTIONS //

/**
 * creates an isolated MockAgent for per-test network interception
 *
 * the returned agent has network connections disabled by default,
 * ensuring all requests must be explicitly intercepted.
 * @returns configured MockAgent with network connections disabled
 */
export function createMockAgent(): MockAgent {
  const agent = new MockAgent();

  agent.disableNetConnect();

  return agent;
}

/**
 * intercepts requests to the origin with a network connection error
 * @param agent MockAgent to configure the interception on
 * @param origin target origin URL to intercept (e.g. "http://localhost:19999")
 */
export function interceptWithNetworkError(
  agent: MockAgent,
  origin: string,
): void {
  const pool = agent.get(origin);

  pool
    .intercept({ path: /.*/, method: /.*/ })
    .replyWithError(new Error('Network connection refused'));
}

/**
 * intercepts requests to the origin with a delayed/hanging response
 * @param agent MockAgent to configure the interception on
 * @param origin target origin URL to intercept (e.g. "http://localhost:19999")
 * @param delayMs delay in milliseconds before responding
 */
export function interceptWithTimeout(
  agent: MockAgent,
  origin: string,
  delayMs: number,
): void {
  const pool = agent.get(origin);

  pool.intercept({ path: /.*/, method: /.*/ }).reply(
    200,
    async () =>
      new Promise((resolve) => {
        setTimeout(() => resolve(''), delayMs);
      }),
  );
}

/**
 * intercepts requests to the origin and aborts the response mid-stream
 * @param agent MockAgent to configure the interception on
 * @param origin target origin URL to intercept (e.g. "http://localhost:19999")
 */
export function interceptWithAbortMidStream(
  agent: MockAgent,
  origin: string,
): void {
  const pool = agent.get(origin);

  pool
    .intercept({ path: /.*/, method: /.*/ })
    .replyWithError(new Error('Aborted: connection reset mid-stream'));
}

/**
 * creates a fetch function that uses the MockAgent as its dispatcher
 *
 * the returned function is compatible with the global fetch signature
 * and routes all requests through the provided MockAgent for interception.
 * @param agent MockAgent to use as the request dispatcher
 * @returns fetch-compatible function routed through the MockAgent
 */
export function createInterceptedFetch(
  agent: MockAgent,
): typeof globalThis.fetch {
  return (input, init) => {
    // strip the incompatible dispatcher type from global RequestInit
    // before forwarding to undici, which uses its own Dispatcher type
    const { dispatcher: _, ...options } = { ...init };

    return undiciFetch(input, { ...options, dispatcher: agent });
  };
}
