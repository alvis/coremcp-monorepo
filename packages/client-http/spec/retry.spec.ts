import { describe, expect, it, vi } from 'vitest';

import { retry, NonRetryableError } from '#retry';

import type { RetryDelayFunction } from '#retry';

vi.useFakeTimers();

/**
 * creates function that returns promise which delays before resolving
 * used for testing timeout behavior where promises don't resolve within expected timeframe
 * @returns function that accepts retry parameters and returns delayed promise
 */
const createDelayedSuccess = (): ((params: {
  attempt: number;
  abortSignal: AbortSignal;
}) => Promise<string>) => {
  return async ({ abortSignal }) => {
    return new Promise((resolve) => {
      // this promise intentionally delays beyond timeout for testing
      const timeoutId = setTimeout(() => {
        cleanup();
        resolve('delayed success');
      }, 1000);

      // cleanup timeout handler when operation is aborted
      const cleanup = () => {
        clearTimeout(timeoutId);
        abortSignal.removeEventListener('abort', cleanup);
      };
      abortSignal.addEventListener('abort', cleanup);
    });
  };
};

describe('fn:retry', () => {
  it('should resolve immediately on success', async () => {
    const log = vi.fn();

    const mockFn = vi.fn(async () => 'success');

    const expected = 'success';

    const result = await retry(mockFn, { log, retryDelay: 0 });

    expect(result).toBe(expected);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task success on attempt #0'],
    ]);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure until max retries is reached', async () => {
    const log = vi.fn();

    const error = new Error('test error');
    const mockFn = vi.fn().mockRejectedValue(error);

    const promise = retry(mockFn, {
      log,
      maxRetries: 2,
      onRetry: () => vi.runOnlyPendingTimers(),
      retryDelay: 0,
    });

    await expect(promise).rejects.toThrow(Error);
    await expect(promise).rejects.toThrow('test error');
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['debug', 'retryable task failed on attempt #1'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task failed on attempt #2'],
      [
        'debug',
        'retryable task stopped retrying after 3 attempts',
        expect.objectContaining({
          name: 'Error',
          message: 'test error',
        }),
      ],
    ]);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should retry with increasing delay when a function is provided', async () => {
    const log = vi.fn();

    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockResolvedValue('success');
    const retryDelay = vi.fn<RetryDelayFunction>(
      ({ attempt }) => (attempt + 1) * 100,
    );

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
      retryDelay,
    });

    // run the first attempt
    await vi.advanceTimersByTimeAsync(0);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // should wait 100ms for first retry
    await vi.advanceTimersByTimeAsync(100);
    expect(mockFn).toHaveBeenCalledTimes(2);

    // should wait 200ms for second retry
    await vi.advanceTimersByTimeAsync(200);
    expect(mockFn).toHaveBeenCalledTimes(3);

    const expected = 'success';

    const result = await promise;

    expect(result).toBe(expected);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 100ms'],
      ['debug', 'retryable task attempt #1'],
      ['debug', 'retryable task failed on attempt #1'],
      ['debug', 'retryable task retrying in 200ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task success on attempt #2'],
    ]);
    expect(retryDelay).toHaveBeenCalledTimes(2);
    expect(retryDelay).toHaveBeenNthCalledWith(1, {
      attempt: 0,
      name: 'retryable task',
      maxRetries: 5,
      maxTimeout: Infinity,
      timeout: Infinity,
      error: expect.objectContaining({
        message: 'error 1',
        name: 'Error',
      }),
    });
    expect(retryDelay).toHaveBeenNthCalledWith(2, {
      attempt: 1,
      name: 'retryable task',
      maxRetries: 5,
      maxTimeout: Infinity,
      timeout: Infinity,
      error: expect.objectContaining({
        message: 'error 2',
        name: 'Error',
      }),
    });
  });

  it('should retry with exponential backoff by default', async () => {
    const log = vi.fn();

    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockResolvedValue('success');

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFn).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(50);
    expect(mockFn).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(100);
    expect(mockFn).toHaveBeenCalledTimes(3);

    const result = await promise;

    expect(result).toBe('success');
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 50ms'],
      ['debug', 'retryable task attempt #1'],
      ['debug', 'retryable task failed on attempt #1'],
      ['debug', 'retryable task retrying in 100ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task success on attempt #2'],
    ]);
  });

  it('should never run if abortSignal is triggered before retry', async () => {
    const log = vi.fn();

    const mockFn = vi.fn().mockRejectedValue(new Error('test error'));
    const abortController = new AbortController();
    abortController.abort();

    const promise = retry(mockFn, {
      abortSignal: abortController.signal,
      log,
      maxRetries: 5,
      retryDelay: 100,
    });

    expect(mockFn).not.toHaveBeenCalled();
    await expect(promise).rejects.toThrow();
  });

  it('should stop retrying if abortSignal is triggered', async () => {
    const log = vi.fn();

    const mockFn = vi.fn().mockRejectedValue(new Error('test error'));
    const abortController = new AbortController();

    const promise = retry(mockFn, {
      abortSignal: abortController.signal,
      log,
      maxRetries: 5,
      retryDelay: 100,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(mockFn).toHaveBeenCalledTimes(1);

    // abort after first try
    abortController.abort();

    await expect(promise).rejects.toThrow();
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 100ms'],
      [
        'info',
        'retryable task aborted',
        {
          attempt: 1,
          maxRetries: 5,
          maxTimeout: Infinity,
          name: 'retryable task',
          timeout: Infinity,
        },
      ],
    ]);
  });

  it('should stop retrying if maxTimeout is reached', async () => {
    // WORKAROUND: intentionally set the real timer due to a bug in vitest that AbortSignal.timeout is not mocked
    // see https://github.com/vitest-dev/vitest/issues/3088
    // see https://github.com/sinonjs/fake-timers/issues/418
    vi.useRealTimers();

    const log = vi.fn();

    const mockFn = vi.fn().mockRejectedValue(new Error('test error'));

    const promise = retry(mockFn, {
      log,
      maxTimeout: 10,
      maxRetries: 10,
      retryDelay: 0,
    });

    await expect(promise).rejects.toThrow(
      'retryable task exceeded max timeout 10ms',
    );
    // no more calls after timeout
    expect(mockFn).toHaveBeenCalled();
  });

  it('should pass abortSignal to the function being retried', async () => {
    const log = vi.fn();

    const mockFn = vi.fn(async ({ abortSignal }) => {
      expect(abortSignal).toBeInstanceOf(AbortSignal);
      expect(abortSignal.aborted).toBe(false);

      return Promise.resolve('success');
    });

    await retry(mockFn, { log, retryDelay: 0 });
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task success on attempt #0'],
    ]);
  });

  it('should eventually succeed after multiple retries', async () => {
    vi.useFakeTimers();
    const log = vi.fn();

    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('error 1'))
      .mockRejectedValueOnce(new Error('error 2'))
      .mockRejectedValueOnce(new Error('error 3'))
      .mockResolvedValue('success');

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
      retryDelay: 0,
    });

    await vi.runAllTimersAsync();

    const expected = 'success';

    const result = await promise;

    expect(result).toBe(expected);
    expect(mockFn).toHaveBeenCalledTimes(4);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['debug', 'retryable task failed on attempt #1'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task failed on attempt #2'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #3'],
      ['debug', 'retryable task success on attempt #3'],
    ]);
  });

  it('should timeout individual attempts according to the timeout option', async () => {
    // WORKAROUND: intentionally set the real timer due to a bug in vitest that AbortSignal.timeout is not mocked
    // see https://github.com/vitest-dev/vitest/issues/3088
    // see https://github.com/sinonjs/fake-timers/issues/418
    vi.useRealTimers();

    const log = vi.fn();

    // create a mock function that will hang for longer than the timeout
    const mockFn = vi.fn(createDelayedSuccess());

    const promise = retry(mockFn, {
      log,
      abortSignal: new AbortController().signal,
      maxRetries: 2,
      retryDelay: 0,
      timeout: 10,
    });

    // all attempts should have timed out, so the promise should reject
    await expect(promise).rejects.toThrow(
      'retryable task attempt #2 exceeded timeout 10ms',
    );
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['warn', 'retryable task attempt #0 exceeded timeout 10ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['warn', 'retryable task attempt #1 exceeded timeout 10ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      ['warn', 'retryable task attempt #2 exceeded timeout 10ms'],
      [
        'debug',
        'retryable task stopped retrying after 3 attempts',
        expect.objectContaining({
          name: 'Error',
          message: 'retryable task attempt #2 exceeded timeout 10ms',
        }),
      ],
    ]);
  });

  it('should respect both individual attempt timeout and maxTimeout', async () => {
    // WORKAROUND: intentionally set the real timer due to a bug in vitest that AbortSignal.timeout is not mocked
    // see https://github.com/vitest-dev/vitest/issues/3088
    // see https://github.com/sinonjs/fake-timers/issues/418
    vi.useRealTimers();

    const log = vi.fn();

    const mockFn = vi.fn(createDelayedSuccess());

    const promise = retry(mockFn, {
      log,
      maxRetries: 2,
      maxTimeout: 75, // total operation should timeout after 50ms
      retryDelay: 0,
      timeout: 25, // each attempt should timeout after 10ms
    });

    // should reject due to maxTimeout being exceeded
    await expect(promise).rejects.toThrow(
      'retryable task exceeded max timeout 75ms',
    );
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['warn', 'retryable task attempt #0 exceeded timeout 25ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['warn', 'retryable task attempt #1 exceeded timeout 25ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      [
        'error',
        'retryable task exceeded max timeout 75ms',
        {
          attempt: 2,
          maxRetries: 2,
          maxTimeout: 75,
          name: 'retryable task',
          timeout: 25,
        },
      ],
    ]);
  });

  it('should continue retrying after individual timeouts until success', async () => {
    // WORKAROUND: intentionally set the real timer due to a bug in vitest that AbortSignal.timeout is not mocked
    // see https://github.com/vitest-dev/vitest/issues/3088
    // see https://github.com/sinonjs/fake-timers/issues/418
    vi.useRealTimers();

    const log = vi.fn();

    // first two calls will hang and timeout, third call will succeed quickly
    const mockFn = vi
      .fn()
      .mockImplementationOnce(createDelayedSuccess())
      .mockImplementationOnce(createDelayedSuccess())
      .mockImplementationOnce(async () => {
        return 'quick success';
      });

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
      retryDelay: 0,
      timeout: 10, // each attempt times out after 10ms
    });

    const expected = 'quick success';

    const result = await promise;

    expect(result).toBe(expected);
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['warn', 'retryable task attempt #0 exceeded timeout 10ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['warn', 'retryable task attempt #1 exceeded timeout 10ms'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task success on attempt #2'],
    ]);
  });

  it('call onRetry callback with error metadata', async () => {
    vi.useFakeTimers();
    const log = vi.fn();
    const onRetry = vi.fn();

    const error1 = new Error('first error');
    const error2 = new Error('second error');
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockResolvedValue('success');

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
      onRetry,
      retryDelay: 0,
    });

    await vi.runAllTimersAsync();

    const result = await promise;

    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, {
      attempt: 0,
      name: 'retryable task',
      maxRetries: 5,
      maxTimeout: Infinity,
      timeout: Infinity,
      error: expect.objectContaining({
        message: 'first error',
        name: 'Error',
      }),
    });
    expect(onRetry).toHaveBeenNthCalledWith(2, {
      attempt: 1,
      name: 'retryable task',
      maxRetries: 5,
      maxTimeout: Infinity,
      timeout: Infinity,
      error: expect.objectContaining({
        message: 'second error',
        name: 'Error',
      }),
    });
  });

  it('should not retry on non-retryable errors', async () => {
    const log = vi.fn();

    const error = new NonRetryableError('non-retryable error');
    const mockFn = vi.fn().mockRejectedValue(error);

    const promise = retry(mockFn, {
      log,
      maxRetries: 5,
      retryDelay: 0,
    });

    await expect(promise).rejects.toThrow('non-retryable error');
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      [
        'debug',
        'retryable task stopped retrying after 1 attempts',
        expect.objectContaining({
          name: 'Error',
          message: 'non-retryable error',
        }),
      ],
    ]);
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should retry on retryable errors', async () => {
    const log = vi.fn();

    const error = new Error('retryable error');
    const mockFn = vi.fn().mockRejectedValue(error);

    const promise = retry(mockFn, {
      log,
      maxRetries: 2,
      onRetry: () => vi.runOnlyPendingTimers(),
      retryDelay: 0,
    });

    await expect(promise).rejects.toThrow(Error);
    await expect(promise).rejects.toThrow('retryable error');
    expect(log.mock.calls).toEqual([
      ['debug', 'retryable task attempt #0'],
      ['debug', 'retryable task failed on attempt #0'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #1'],
      ['debug', 'retryable task failed on attempt #1'],
      ['debug', 'retryable task retrying in 0ms'],
      ['debug', 'retryable task attempt #2'],
      ['debug', 'retryable task failed on attempt #2'],
      [
        'debug',
        'retryable task stopped retrying after 3 attempts',
        expect.objectContaining({
          name: 'Error',
          message: 'retryable error',
        }),
      ],
    ]);
    expect(mockFn).toHaveBeenCalledTimes(3);
  });
});
