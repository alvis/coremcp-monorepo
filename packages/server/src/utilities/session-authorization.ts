/**
 * session authorization utilities for mcp server
 *
 * provides functions to validate session ownership and access control.
 * ensures that sessions can only be accessed by their owners when
 * user authentication is enabled.
 * @module
 */

import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import type { Session, SessionData, SessionStore } from '@coremcp/core';

import type { ConnectionContext } from '#types';

/**
 * validates that a session belongs to the specified user
 *
 * sessions with a userId can only be accessed by that user.
 * anonymous sessions (userId: null) can be accessed by anyone.
 * @param sessionUserId the user id stored in the session (null for anonymous)
 * @param requestUserId the user id from the current request
 * @throws {JsonRpcError} with AUTHORIZATION_FAILED when session does not belong to user
 */
export function validateSessionOwnership(
  sessionUserId: string | null,
  requestUserId?: string,
): void {
  if (sessionUserId && sessionUserId !== requestUserId) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.AUTHORIZATION_FAILED,
      message: 'Forbidden: session does not belong to authenticated user',
    });
  }
}

/**
 * retrieves a session from storage and validates ownership
 * @param sessionId the session id to retrieve
 * @param sessionStore the session storage backend
 * @param requestUserId the user id from the current request
 * @returns the validated session data
 * @throws {JsonRpcError} with RESOURCE_NOT_FOUND when session does not exist
 * @throws {JsonRpcError} with AUTHORIZATION_FAILED when session does not belong to user
 */
export async function retrieveAndValidateStoredSession(
  sessionId: string,
  sessionStore: SessionStore | undefined,
  requestUserId?: string,
): Promise<SessionData> {
  const storedSession = await sessionStore?.get(sessionId);

  if (!storedSession) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.RESOURCE_NOT_FOUND,
      message: 'Not Found: the requested session does not exist',
    });
  }

  validateSessionOwnership(storedSession.userId, requestUserId);

  return storedSession;
}

/** options for validating session existence */
export interface ValidateSessionOptions {
  /** active sessions map for fast in-memory lookup */
  activeSessions: ReadonlyMap<string, Session>;
  /** session storage backend for persisted sessions */
  sessionStorage?: SessionStore;
}

/**
 * validates that a session exists for the given context
 *
 * checks both in-memory active sessions and persistent storage.
 * skips validation when no session id is present (e.g. initialize requests).
 * @param context connection context containing the session id to validate
 * @param options validation configuration with active sessions and storage
 * @throws {JsonRpcError} with RESOURCE_NOT_FOUND when session does not exist
 */
export async function validateSessionExists(
  context: ConnectionContext,
  options: ValidateSessionOptions,
): Promise<void> {
  if (!context.sessionId || options.activeSessions.has(context.sessionId)) {
    return;
  }

  await retrieveAndValidateStoredSession(
    context.sessionId,
    options.sessionStorage,
    context.userId,
  );
}
