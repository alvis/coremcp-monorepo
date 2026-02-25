/**
 * session resumption utilities for mcp server
 *
 * provides functions for resuming existing sessions from in-memory cache
 * or session storage, with user authorization validation.
 * @module
 */

import { Session } from '@coremcp/core';
import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import {
  retrieveAndValidateStoredSession,
  validateSessionOwnership,
} from './session-authorization';
import {
  subscribeToResource,
  unsubscribeFromResource,
} from './subscription-manager';

import type { SessionStore } from '@coremcp/core';

import type { ConnectionContext } from '#types';

import type { SubscriptionMap } from './subscription-manager';

/** context required for resuming a session */
export interface ResumeSessionContext {
  /** map of active sessions keyed by session id */
  activeSessions: Map<string, Session>;
  /** subscription map for resource notifications */
  subscriptions: SubscriptionMap;
  /** optional session storage backend */
  sessionStorage?: SessionStore;
}

/**
 * resumes an existing session from active sessions or storage
 *
 * checks the in-memory active sessions map first for a fast path.
 * if not found, falls back to session storage for persisted sessions.
 * validates user ownership in both cases.
 * @param connectionContext connection context for the session
 * @param serverContext server state needed for session resumption
 * @returns the resumed session
 * @throws {JsonRpcError} when session ID is missing or session not found
 */
export async function resumeSession(
  connectionContext: ConnectionContext,
  serverContext: ResumeSessionContext,
): Promise<Session> {
  const { activeSessions, subscriptions, sessionStorage } = serverContext;
  const sessionId = connectionContext.sessionId;

  if (!sessionId) {
    throw new JsonRpcError({
      code: MCP_ERROR_CODES.INVALID_REQUEST,
      message: 'Session ID is required',
    });
  }

  // check active sessions first (in-memory fast path)
  const activeSession = activeSessions.get(sessionId);

  if (activeSession) {
    // verify user authorization (if session has userId)
    validateSessionOwnership(activeSession.userId, connectionContext.userId);

    // update channel context for this connection
    activeSession.channel = {
      id: connectionContext.channelId,
      side: 'server',
      write: async (notification) => connectionContext.write(notification),
    };

    // NOTE: do not add 'channel-started' event for active sessions
    // as the channel is already active and this is just updating the write function

    return activeSession;
  }

  // fallback to storage for resumed/persisted sessions
  const storedSession = await retrieveAndValidateStoredSession(
    sessionId,
    sessionStorage,
    connectionContext.userId,
  );

  const session = new Session(storedSession, {
    channel: {
      id: connectionContext.channelId,
      side: 'server',
      write: async (notification) => connectionContext.write(notification),
    },
    store: sessionStorage,
    hooks: {
      onSubscribe: (uri) => subscribeToResource(subscriptions, uri, session.id),
      onUnsubscribe: /* istanbul ignore next */ (uri) =>
        unsubscribeFromResource(subscriptions, uri, session.id),
    },
  });

  await session.addEvent({ type: 'channel-started' });

  return session;
}
