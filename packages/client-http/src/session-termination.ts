/**
 * @file Session termination for graceful HTTP MCP connection cleanup
 *
 * provides best-effort session termination notifications to servers before disconnect
 * per REQUIREMENTS.md:21 - servers can use these to clean up resources
 */

/**
 * termination reason indicating why session is ending
 */
export type TerminationReason = 'graceful' | 'error' | 'timeout';

/**
 * parameters for session termination operation
 */
export interface TerminateSessionParams {
  /** MCP session ID assigned by server during initialization */
  sessionId: string;

  /** MCP server URL for sending termination notification */
  serverUrl: string;

  /** reason for session termination (default: 'graceful') */
  reason?: TerminationReason;

  /** whether to send termination notification (default: true) */
  sendNotification?: boolean;

  /** custom fetch implementation (defaults to global fetch) */
  fetch?: typeof globalThis.fetch;
}

/**
 * sends best-effort session termination request to server
 *
 * implements graceful cleanup using the MCP session termination endpoint
 * - sends HTTP DELETE with the current MCP session id
 * - errors are silently ignored (best-effort)
 * - does not block disconnection if termination fails
 * @param params session termination parameters
 * @returns promise resolving when notification sent or error ignored
 * @example
 * ```typescript
 * // graceful termination on user disconnect
 * await terminateSession({
 *   sessionId: 'session-123',
 *   serverUrl: 'https://api.example.com/mcp',
 *   reason: 'graceful',
 * });
 *
 * // error-triggered termination
 * await terminateSession({
 *   sessionId: 'session-123',
 *   serverUrl: 'https://api.example.com/mcp',
 *   reason: 'error',
 * });
 * ```
 */
export async function terminateSession(
  params: TerminateSessionParams,
): Promise<void> {
  // skip if session termination is explicitly disabled
  if (params.sendNotification === false) {
    return;
  }

  const fetchImpl = params.fetch ?? fetch;

  try {
    await fetchImpl(params.serverUrl, {
      method: 'DELETE',
      headers: {
        'Mcp-Session-Id': params.sessionId,
      },
    });
  } catch {
    // ignore all errors during termination per DESIGN.md:1013-1014
    // server may be unreachable and session cleanup should proceed regardless
    // this is best-effort notification per REQUIREMENTS.md:21 (SHOULD not MUST)
  }
}
