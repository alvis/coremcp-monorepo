import type { Log } from '@coremcp/core';

/** context required for handling connection errors */
export interface ConnectionErrorContext {
  /** logger instance for error reporting */
  log?: Log;
  /** name of the connector for log messages */
  name: string;
  /** callback to reset the connector status on failure */
  onDisconnect: () => void;
}

/**
 * handles connection errors by logging and resetting status before rethrowing
 * @param exception the error that occurred during connection
 * @param context connection error handling dependencies
 */
export function handleConnectionError(
  exception: unknown,
  context: ConnectionErrorContext,
): never {
  const error =
    exception instanceof Error ? exception : new Error(String(exception));
  context.log?.('error', `Failed to connect to ${context.name}`, {
    message: error.message,
    stack: error.stack,
  });
  context.onDisconnect();
  throw exception;
}
