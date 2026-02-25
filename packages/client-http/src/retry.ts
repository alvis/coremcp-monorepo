/**
 * @file retry logic with exponential backoff and abort signal support
 *
 * provides robust retry functionality with configurable exponential backoff,
 * timeout handling, abort signal support, and comprehensive error handling
 * for reliable network operations and stream processing
 */

import { jsonifyError } from '@coremcp/core';

import type { Log } from '@coremcp/core';

/** configuration for retry operations */
export type RetryConfig = {
  /** name of the retry operation */
  name: string;
  /** maximum number of retry attempts */
  maxRetries: number;
  /** maximum timeout in milliseconds for the entire retry process */
  maxTimeout: number;
  /** timeout in milliseconds for each individual attempt */
  timeout: number;
};

/** metadata for retry operations including attempt count and error context */
export type RetryMeta = RetryConfig & {
  /** attempt number (starting from 0) */
  attempt: number;
  /** error that triggered the retry attempt */
  error: unknown;
};

/**
 * options for configuring retry behavior
 */
export interface RetryOptions extends Partial<Omit<RetryConfig, 'attempt'>> {
  /** optional logging function */
  log?: Log;
  /** signal to abort the retry process */
  abortSignal?: AbortSignal;
  /** delay in milliseconds between retries or a function to calculate the delay */
  retryDelay?: number | RetryDelayFunction;
  /** callback function invoked on each retry attempt */
  onRetry?: OnRetry;
  /** function to determine if retry should continue given RetryMeta. Defaults to true */
  shouldRetry?: ShouldRetry;
}

/**
 * callback function invoked on each retry attempt
 * @param meta metadata about current retry attempt including error and context
 */
export type OnRetry = (meta: RetryMeta) => void;

/**
 * function to determine whether retry should be attempted
 * @param meta metadata about current retry attempt including error and context
 * @returns true if the operation should be retried, false otherwise
 */
export type ShouldRetry = (meta: RetryMeta) => boolean;

/**
 * function to calculate dynamic delay between retry attempts
 * @param meta metadata about current retry attempt including error and context
 * @returns delay in milliseconds before next retry attempt
 */
export type RetryDelayFunction = (meta: RetryMeta) => number;

/** default maximum number of retry attempts before giving up */
export const DEFAULT_MAX_RETRIES = 2;

/** initial delay in milliseconds for exponential backoff retry strategy */
export const INITIAL_RETRY_DELAY = 50;

/** maximum delay in milliseconds for exponential backoff to prevent excessive waits */
export const MAX_RETRY_DELAY = 1000;

/** error class to indicate operation should not be retried */
export class NonRetryableError extends Error {}

/**
 * executes function with retry capability on failure
 * @param fn the function to execute with retry capability
 * @param options configuration options for retry behavior
 * @param options.name optional name to identify this retry operation in logs
 * @param options.abortSignal signal to abort the retry process, defaults to aborting when the main process is aborted
 * @param options.log optional logging function
 * @param options.retryDelay delay in ms between retries or a function to calculate the delay
 * @param options.maxRetries maximum number of retry attempts
 * @param options.maxTimeout maximum timeout in ms for the entire retry process
 * @param options.timeout timeout in ms for each individual attempt
 * @returns promise resolving with function result
 * @example
 * ```typescript
 * // basic retry
 * const result = await retry(async () => fetchData());
 *
 * // with options
 * const result = await retry(async () => fetchData(), {
 *   maxRetries: 3,
 *   retryDelay: 1000
 * });
 * ```
 */
// eslint-disable-next-line max-lines-per-function
export async function retry<R>(
  fn: (params: { attempt: number; abortSignal: AbortSignal }) => Promise<R>,
  options?: RetryOptions,
): Promise<R> {
  const {
    name = 'retryable task',
    abortSignal,
    log,
    maxRetries = DEFAULT_MAX_RETRIES,
    maxTimeout = Infinity,
    onRetry,
    retryDelay = ({ attempt }: RetryMeta) =>
      Math.min(INITIAL_RETRY_DELAY * 2 ** attempt, MAX_RETRY_DELAY),
    shouldRetry = (meta: RetryMeta) =>
      !(meta.error instanceof NonRetryableError),
    timeout = Infinity,
  } = { ...options };

  const config: RetryConfig = { name, maxRetries, maxTimeout, timeout };
  const { promise, resolve, reject } = Promise.withResolvers<R>();

  // setup signals and event listeners
  const maxTimeoutSignal =
    maxTimeout < Infinity ? AbortSignal.timeout(maxTimeout) : null;
  const effectiveSignal = createCombinedSignal(abortSignal, maxTimeoutSignal);

  // attempt counter
  let attempt = 0;

  // create abort handlers
  const getAttempts = (): number => attempt;
  const common = { config, log, reject, getAttempts };
  const onAbort = createOnAbort(common);
  const onMaxTimeout = createOnTimeout(common);

  abortSignal?.addEventListener('abort', onAbort);
  maxTimeoutSignal?.addEventListener('abort', onMaxTimeout);

  async function run(): Promise<void> {
    const meta = { attempt, ...config };

    try {
      if (effectiveSignal.aborted) {
        throw new NonRetryableError(`${name} aborted`);
      }

      log?.('debug', `${name} attempt #${attempt}`);
      await tryRun({ fn, log, meta, abortSignal: effectiveSignal }).then(
        resolve,
      );
    } catch (error: unknown) {
      const retryMeta = { ...meta, error };
      if (
        attempt < maxRetries &&
        !effectiveSignal.aborted &&
        shouldRetry(retryMeta)
      ) {
        const delay =
          typeof retryDelay === 'function' ? retryDelay(retryMeta) : retryDelay;

        log?.('debug', `${name} retrying in ${delay}ms`);
        attempt++;
        setTimeout(run, delay);

        onRetry?.(retryMeta);
      } else {
        log?.(
          'debug',
          `${name} stopped retrying after ${attempt + 1} attempts`,
          jsonifyError(error),
        );
        reject(error);
      }
    }
  }

  try {
    void run();

    return await promise;
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
    maxTimeoutSignal?.removeEventListener('abort', onMaxTimeout);
  }
}

/**
 * runs a single attempt with timeout
 * @param params execution parameters
 * @param params.fn function to execute
 * @param params.meta metadata for logging
 * @param params.abortSignal abort signal
 * @param params.log logger function
 * @returns promise resolving to function result
 */
async function tryRun<R>(params: {
  fn: (params: { attempt: number; abortSignal: AbortSignal }) => Promise<R>;
  log?: Log;
  meta: Omit<RetryMeta, 'error'>;
  abortSignal: AbortSignal;
}): Promise<R> {
  const { fn, log, meta, abortSignal } = params;
  const { attempt, name, timeout } = meta;

  const { promise, resolve, reject } = Promise.withResolvers<R>();

  const attemptTimeoutSignal =
    timeout > 0 && timeout < Infinity ? AbortSignal.timeout(timeout) : null;
  const onAttemptAbort = (): void => {
    const message = `${name} attempt #${attempt} exceeded timeout ${timeout}ms`;
    log?.('warn', message);
    reject(new Error(message));
  };
  attemptTimeoutSignal?.addEventListener('abort', onAttemptAbort);

  const effectiveSignal = createCombinedSignal(
    attemptTimeoutSignal,
    abortSignal,
  );

  void fn({ attempt, abortSignal: effectiveSignal })
    .then((result) => {
      log?.('debug', `${name} success on attempt #${attempt}`);
      resolve(result);
    })
    .catch((exception) => {
      log?.('debug', `${name} failed on attempt #${attempt}`);
      reject(exception);
    });

  return promise.finally(() =>
    attemptTimeoutSignal?.removeEventListener('abort', onAttemptAbort),
  );
}

/**
 * combines abort signals if needed
 * @param signals list of potential abort signals
 * @returns combined signal or primary signal
 */
function createCombinedSignal(
  ...signals: Array<AbortSignal | null | undefined>
): AbortSignal {
  return AbortSignal.any(signals.filter((signal) => !!signal));
}

/**
 * handles the abort signal for a retry operation
 * @param params handler parameters
 * @param params.config retry configuration
 * @param params.log optional logger
 * @param params.reject function to reject the promise
 * @param params.getAttempts function to get the current attempt count
 * @returns a function to handle the abort signal
 */
function createOnAbort(params: {
  config: RetryConfig;
  log: Log | undefined;
  reject: (reason?: unknown) => void;
  getAttempts: () => number;
}): () => void {
  const { config, getAttempts, log, reject } = params;
  const { name } = config;

  const onAbort = (): void => {
    const message = `${name} aborted`;
    const meta = { ...config, attempt: getAttempts() };
    log?.('info', message, meta);
    reject(new Error(message));
  };

  return onAbort;
}

/**
 * handles the max timeout signal for a retry operation
 * @param params handler parameters
 * @param params.config retry configuration
 * @param params.log optional logger
 * @param params.reject function to reject the promise
 * @param params.getAttempts function to get the current attempt count
 * @returns a function to handle the max timeout signal
 */
function createOnTimeout(params: {
  config: RetryConfig;
  log: Log | undefined;
  reject: (reason?: unknown) => void;
  getAttempts: () => number;
}): () => void {
  const { config, getAttempts, log, reject } = params;
  const { name, maxTimeout } = config;

  const onMaxTimeout = (): void => {
    const message = `${name} exceeded max timeout ${maxTimeout}ms`;
    const meta = { ...config, attempt: getAttempts() };
    log?.('error', message, meta);
    reject(new Error(message));
  };

  return onMaxTimeout;
}
