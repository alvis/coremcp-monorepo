import {
  createRequestFromEvent,
  extractMessageFromEvent,
  updateRequestFromResponse,
} from './event-processor';

import type {
  JsonRpcRequestData,
  JsonRpcRequestEnvelope,
  RequestId,
} from '@coremcp/protocol';

import type { SessionEvent, SessionRequest } from './types';

/** active request entry with its abort controller */
export interface ActiveRequestEntry {
  /** contains the json-rpc request data */
  request: JsonRpcRequestData;
  /** provides the abort signal for request cancellation */
  controller: AbortController;
}

/**
 * starts tracking a request by creating an abort controller
 * @param activeRequests map of active request entries
 * @param id request identifier
 * @param request json-rpc request envelope
 * @returns the abort controller for the request
 */
export function startTracking(
  activeRequests: Map<RequestId, ActiveRequestEntry>,
  id: RequestId,
  request: JsonRpcRequestEnvelope,
): AbortController {
  const controller = new AbortController();
  activeRequests.set(id, { controller, request });

  return controller;
}

/**
 * ends tracking of a request and removes its abort controller
 * @param activeRequests map of active request entries
 * @param id request identifier
 * @returns true if the request was being tracked, false otherwise
 */
export function endTracking(
  activeRequests: Map<RequestId, ActiveRequestEntry>,
  id: RequestId,
): boolean {
  return activeRequests.delete(id);
}

/**
 * cancels a request by aborting its controller if it exists
 * @param activeRequests map of active request entries
 * @param id request identifier
 * @returns true if the request was found and aborted, false otherwise
 */
export function cancelTracking(
  activeRequests: Map<RequestId, ActiveRequestEntry>,
  id: RequestId,
): boolean {
  const controller = activeRequests.get(id)?.controller;
  if (controller) {
    controller.abort();
    activeRequests.delete(id);

    return true;
  }

  return false;
}

/**
 * updates request state based on a session event
 * @param requests map of session requests
 * @param event session event that may affect request state
 */
export function updateRequestFromEvent(
  requests: Map<RequestId, SessionRequest>,
  event: SessionEvent,
): void {
  const message = extractMessageFromEvent(event);
  if (!message || !('id' in message)) {
    return;
  }

  const requestId = message.id as RequestId;

  if ('method' in message) {
    requests.set(
      requestId,
      createRequestFromEvent(event, message as JsonRpcRequestData),
    );
  } else {
    const request = requests.get(requestId);
    if (request) {
      updateRequestFromResponse(request, event, message);
    }
  }
}
