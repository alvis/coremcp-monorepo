import type {
  JsonRpcNotificationData,
  JsonRpcRequestData,
  JsonRpcResultData,
  RequestId,
} from '@coremcp/protocol';

import type {
  SessionAssistantMessageEvent,
  SessionClientMessageEvent,
  SessionEvent,
  SessionRequest,
  SessionServerMessageEvent,
} from './types';

/**
 * creates a new session request from a message event
 * @param event the event containing the request message
 * @param message the JSON-RPC request message
 * @returns a new session request object
 */
export function createRequestFromEvent(
  event: SessionEvent,
  message: JsonRpcRequestData,
): SessionRequest {
  return {
    id: message.id as RequestId,
    from: event.type === 'client-message' ? 'client' : 'server',
    createdAt: event.occurredAt,
    lastActivity: event.occurredAt,
    status: 'processing',
    request: message,
    notifications: [],
    result: undefined,
    subRequests: [],
    events: [event],
  };
}

/**
 * updates an existing request with a response event
 * @param request the request to update (mutated in place)
 * @param event the event containing the response
 * @param message the response message
 * @param message.result optional result data from the response
 * @param message.error optional error data from the response
 */
export function updateRequestFromResponse(
  request: SessionRequest,
  event: SessionEvent,
  message: { result?: unknown; error?: unknown },
): void {
  request.lastActivity = event.occurredAt;
  request.events.push(event);

  if (message.result) {
    request.result = message.result as JsonRpcResultData;
    request.status = 'fulfilled';
  } else if (message.error) {
    request.result = message as JsonRpcResultData;
    request.status = 'error';
  } else {
    request.notifications.push(message as JsonRpcNotificationData);
  }
}

/**
 * extracts message from an event if it's a message event type
 * @param event the session event to check
 * @returns the message object or null if not a message event
 */
export function extractMessageFromEvent(
  event: SessionEvent,
):
  | (
      | SessionServerMessageEvent
      | SessionClientMessageEvent
      | SessionAssistantMessageEvent
    )['message']
  | null {
  if (
    event.type === 'channel-started' ||
    event.type === 'channel-ended' ||
    event.type === 'abort'
  ) {
    return null;
  }

  return (
    event as
      | SessionServerMessageEvent
      | SessionClientMessageEvent
      | SessionAssistantMessageEvent
  ).message;
}
