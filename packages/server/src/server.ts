import { jsonifyError, Session } from '@coremcp/core';

import {
  getVersionedValidators,
  JSONRPC_VERSION,
  JsonRpcError,
  MCP_ERROR_CODES,
  SUPPORTED_PROTOCOL_VERSIONS,
  negotiateProtocolVersion,
} from '@coremcp/protocol';

import { createCapabilities } from '#capability';
import {
  DEFAULT_INACTIVITY_TIMEOUT_MS,
  DEFAULT_PULL_INTERVAL_MS,
  DEFAULT_RESUME_TIMEOUT_MS,
} from '#constants/defaults';
import { methodToHandlerMap, resolveHandlers } from '#handlers';
import {
  cleanupSessionSubscriptions,
  createErrorMessageEnvelope,
  createSessionData,
  generateSessionId,
  notifySessionInitialized,
  retrieveAndValidateStoredSession,
  subscribeToResource,
  unsubscribeFromResource,
  validateSessionOwnership,
} from '#utilities';

import type {
  Log,
  SessionStore,
  SessionEvent,
  SessionServerMessageEvent,
} from '@coremcp/core';
import type {
  AppInfo,
  InitializeRequest,
  JsonRpcMessage,
  JsonRpcNotificationEnvelope,
  JsonRpcRequestEnvelope,
  JsonRpcResponseEnvelope,
  Prompt,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

import type { ConnectionContext, ServerRequestHandler } from '#types';
import type { SubscriptionMap } from '#utilities';

/** configuration options for initializing an mcp server instance */
export interface McpServerOptions {
  /** server application information including name and version */
  serverInfo: AppInfo;
  /** optional session storage backend for persisting session state */
  sessionStore?: SessionStore;
  /** logs server operations */
  log?: Log;
  /** default set of tools available to all clients */
  tools?: Tool[];
  /** default set of prompts available to all clients */
  prompts?: Prompt[];
  /** default set of resources available to all clients */
  resources?: Resource[];
  /** default set of resource templates available to all clients */
  resourceTemplates?: ResourceTemplate[];
  /** optional usage instructions for the server */
  instructions?: string;
  /** handles dynamic MCP method processing */
  handlers?: Partial<ServerRequestHandler>;
  /**
   * custom session ID generator function.
   *
   * if not provided, uses default Base62 UUID generation.
   * generator errors fall back to default with warning logs.
   */
  sessionIdGenerator?: () => string;
  /**
   * lifecycle callback invoked after session successfully initialized.
   *
   * receives session ID and user ID (if authenticated). errors in callback
   * do not affect session creation. async callbacks are fire-and-forget.
   */
  onSessionInitialized?: (sessionId: string, userId?: string) => Promise<void>;
}

const {
  requests: { initialize: validateInitializeRequest },
} = await getVersionedValidators('2024-11-05');

/** mcp server implementation that handles json-rpc protocol communication */
export class McpServer {
  // private fields //

  /** default set of tools available to all clients */
  #tools: Tool[];
  /** default set of prompts available to all clients */
  #prompts: Prompt[];
  /** default set of resources available to all clients */
  #resources: Resource[];
  /** default set of resource templates available to all clients */
  #resourceTemplates: ResourceTemplate[];
  /** server capabilities declaration */
  #capabilities: ServerCapabilities;
  /** optional session storage backend for persisting session state */
  #sessionStorage?: SessionStore;
  /** resolved handler functions */
  #handlers: ServerRequestHandler;
  /** server application information including name and version */
  #serverInfo: AppInfo;
  /** logs server operations */
  #log?: Log;
  /** subscription management - maps resource uri to set of subscribed session ids */
  #subscriptions: SubscriptionMap = new Map();
  /** active sessions map for broadcasting notifications */
  #activeSessions = new Map<string, Session>();
  /** custom session ID generator function */
  #sessionIdGenerator?: () => string;
  /** lifecycle callback invoked after session initialized */
  #onSessionInitialized?: (sessionId: string, userId?: string) => Promise<void>;

  // constructor //

  /**
   * creates a new mcp server instance with the specified configuration
   * @param params configuration options for the mcp server
   */
  constructor(params: McpServerOptions) {
    this.#prompts = params.prompts ?? [];
    this.#resources = params.resources ?? [];
    this.#resourceTemplates = params.resourceTemplates ?? [];
    this.#tools = params.tools ?? [];
    this.#serverInfo = params.serverInfo;
    this.#log = params.log;
    this.#sessionStorage = params.sessionStore;
    this.#sessionIdGenerator = params.sessionIdGenerator;
    this.#onSessionInitialized = params.onSessionInitialized;

    this.#handlers = resolveHandlers(params.handlers);
    this.#capabilities = createCapabilities(params);
  }

  // public getters //

  /**
   * retrieves the server's capability declaration
   * @returns frozen server capabilities object
   */
  public get capabilities(): ServerCapabilities {
    return this.#capabilities;
  }

  /**
   * retrieves server status including pending requests and active sessions
   * @returns object containing pending request count and total session count
   */
  public get status(): { pendingRequests: number; totalSessions: number } {
    const pendingRequests = [...this.#activeSessions.values()].reduce(
      (total, session) => total + session.activeRequests.size,
      0,
    );

    const totalSessions = this.#activeSessions.size;

    return { pendingRequests, totalSessions };
  }

  // public methods //

  /**
   * initializes or resumes a session for a client connection
   * @param params initialization request parameters from the client
   * @param context connection context including session and transport information
   * @returns initialized or resumed session instance
   */
  public async initializeSession(
    params: InitializeRequest['params'],
    context: ConnectionContext,
  ): Promise<Session> {
    this.#log?.('debug', 'initializing client session', { params });

    // negotiate protocol version - use the highest supported version that the server support if unmatched
    const negotiatedVersion = negotiateProtocolVersion(
      params.protocolVersion,
      SUPPORTED_PROTOCOL_VERSIONS,
    );

    // generate session ID using custom generator or default
    const sessionId = generateSessionId({
      generator: this.#sessionIdGenerator,
      log: this.#log,
    });

    const data = createSessionData({
      sessionId,
      protocolVersion: negotiatedVersion,
      userId: context.userId,
      clientInfo: params.clientInfo,
      serverInfo: this.#serverInfo,
      clientCapabilities: params.capabilities,
      serverCapabilities: this.#capabilities,
      tools: this.#tools,
      prompts: this.#prompts,
      resources: this.#resources,
      resourceTemplates: this.#resourceTemplates,
    });

    // store the new session to the store
    void this.#sessionStorage?.set(data);

    const session = new Session(data, {
      channel: { id: context.channelId, side: 'server', write: context.write },
      store: this.#sessionStorage,
      hooks: {
        // subscription management //
        onSubscribe: async (uri) =>
          subscribeToResource(this.#subscriptions, uri, data.id),
        onUnsubscribe: async (uri) =>
          unsubscribeFromResource(this.#subscriptions, uri, data.id),
      },
    });
    this.#sessionStorage?.subscribe(session.id, async (event) =>
      // actively add event to the session if it supports push notification
      session.addEvent(event, { skipSave: true }),
    );

    // add previously registered subscriptions
    /* istanbul ignore next */
    for (const uri of session.subscriptions) {
      subscribeToResource(this.#subscriptions, uri, session.id);
    }

    // track active session for broadcasting
    this.#activeSessions.set(session.id, session);

    // upsert the session
    await session.addEvent({ type: 'channel-started' });

    this.#log?.('info', `client session initialized successfully`, {
      protocolVersion: session.protocolVersion,
      capabilities: session.capabilities,
    });

    // notify session initialization (fire-and-forget)
    notifySessionInitialized({
      callback: this.#onSessionInitialized,
      sessionId: session.id,
      userId: context.userId,
      log: this.#log,
    });

    return session;
  }

  /**
   * handles incoming json-rpc messages from clients
   * @param message the json-rpc message to process
   * @param context connection context for the request
   * @param options optional configuration for message handling
   * @param options.onInitialize callback invoked after session initialization
   * @returns promise that resolves when message processing is complete
   */
  public async handleMessage(
    message: JsonRpcMessage,
    context: ConnectionContext,
    options?: { onInitialize?: (session: Session) => void },
  ): Promise<void> {
    // IMPORTANT NOTE: handleMessage will not disconnect the channel at the end; it only write to the channel in response to any incoming requests

    // handle SPECIAL CASE ping //
    if (message.method === 'ping' && message.id) {
      // NOTE: all ping message will not be logged to the session
      return context.write({
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result: {},
      });
    }

    try {
      // handle FIRST client-to-server request //
      if (message.method === 'initialize' && 'params' in message) {
        // validate initialization-specific parameters
        const initial = validateInitializeRequest(message);

        // create session with http transport context
        const session = await this.initializeSession(initial.params, context);

        /* istanbul ignore next - onInitialize callback is optional and tested separately */
        options?.onInitialize?.(session);

        return await this.handleRequestMessage(message, session);
      }

      // handle OTHER cases //

      const session = await this.#resumeSession(context);

      /* istanbul ignore next */
      if (message.result || message.error) {
        // handle RESPONSE from a server-to-client request //
        /* istanbul ignore next */
        /* istanbul ignore next */
        return (
          /* istanbul ignore next */
          await session.addEvent({
            type: 'client-message',
            responseToRequestId: message.id,
            message,
          })
        );
      }

      if (message.id !== undefined) {
        // handle SUBSEQUENT client-to-server request //

        return await this.handleRequestMessage(message, session);
      } else {
        // handle NOTIFICATION from a client //
        return await this.handleNotificationMessage(message, session);
      }
    } catch (exception) {
      // catching errors that is not thrown from handleRequestMessage or handleNotificationMessage
      // i.e. from validateInitializeRequest, this.initializeSession, this.#resolveSession & session.sync

      this.#log?.('error', `failed to handle JSON-RPC message`, {
        message,
        error: jsonifyError(exception),
      });

      // NOTE: throw the error again for the transport layer to response in the transport-specific format
      throw exception;
    }
  }

  /**
   * resumes a previously disconnected request
   * @param context connection context for the session to resume
   * @returns promise that resolves when the resumed message handling is complete
   */
  public async resumeMessage(context: ConnectionContext): Promise<void> {
    const { sessionId } = context;

    this.#log?.('debug', `resuming session`, { sessionId });

    const session = await this.#resumeSession(context);

    this.#log?.('debug', `session found`, { sessionId });

    void context.waitUntilClosed.then(async () => {
      // stop receiving notification when the connection is closed
      this.#log?.('debug', `terminating notification broadcast`, { sessionId });

      // signal that the channel session is closed
      await this.pauseSession(session);
    });

    /* istanbul ignore next */
    if (context.lastEventId) {
      /* istanbul ignore next */
      const lastEventIndex = session.events.findIndex(
        (event) => event.id === context.lastEventId,
      );

      if (lastEventIndex !== -1) {
        const lastEvent = session.events[
          lastEventIndex
        ] as SessionServerMessageEvent; // last event sent to a client must be a server-message

        const undeliveredEvents = session.events.slice(lastEventIndex);

        // deliver missing events
        for (const event of undeliveredEvents) {
          if (
            event.type === 'server-message' &&
            event.responseToRequestId === lastEvent.responseToRequestId
          ) {
            // NOTE: do not use session.reply since it will add events to the data store
            await context.write(event.message);
          }
        }

        const { promise: waitUntilChannelEnded, resolve: signalChannelEnded } =
          Promise.withResolvers<void>();

        // setup maximum timeout for waiting any undelivered messages from previous contact
        const timeout = setTimeout(
          signalChannelEnded,
          DEFAULT_RESUME_TIMEOUT_MS,
        );

        /* istanbul ignore next */
        const handleEvent = /* istanbul ignore next */ async (
          event: SessionEvent,
        ): Promise<void> => {
          /* istanbul ignore next */
          if (
            event.type === 'server-message' &&
            event.responseToRequestId === lastEvent.responseToRequestId
          ) {
            /* istanbul ignore next */
            await context.write(event.message);

            /* istanbul ignore next */
            if (event.message.result) {
              // when a request is finished
              /* istanbul ignore next */
              signalChannelEnded();
              /* istanbul ignore next */
              clearTimeout(timeout);
            }
          }
        };

        this.#sessionStorage?.subscribe(session.id, handleEvent);

        if (!this.#sessionStorage?.capabilities.push) {
          const interval = setInterval(async () => {
            // try to pull the session store every second if it doesn't support push notification until timeout
            const newEvents = await session.sync();

            newEvents.forEach(handleEvent);
          }, DEFAULT_PULL_INTERVAL_MS);

          // stop pulling when the previous channel has ended
          void waitUntilChannelEnded.then(() => clearInterval(interval));
        }

        return Promise.race([
          context.waitUntilClosed,
          // return when the request is complete and sent to the client
          waitUntilChannelEnded,
        ]);
      }
    }

    return context.waitUntilClosed;
  }

  /**
   * terminates an active session and cleans up associated resources
   * @param context connection context for authentication and session identifier to terminate
   */
  public async terminateSession(context: ConnectionContext): Promise<void> {
    const { sessionId } = context;
    this.#log?.('debug', 'terminating session', { sessionId });
    const session = await this.#resumeSession(context);

    // get the active session to clean up
    const activeSession = this.#activeSessions.get(session.id);

    // if we have an active session, clean it up properly
    if (activeSession) {
      // use pauseSession to handle subscription cleanup
      await this.pauseSession(activeSession);
    }

    // remove session from storage
    await this.#sessionStorage?.drop(session.id);

    this.#log?.('info', 'session terminated successfully', { sessionId });
  }

  /**
   * handles incoming json-rpc request messages by routing them to appropriate handlers
   * @param message json-rpc request or notification envelope
   * @param session current client session
   * @returns handler result data
   * @throws {JsonRpcError} when method is not found
   */
  public async handleRequestMessage(
    message: JsonRpcRequestEnvelope,
    session: Session,
  ): Promise<void> {
    this.#log?.('debug', `processing JSON-RPC request: ${message.method}`, {
      messageId: message.id,
      messageMethod: message.method,
      request: message.params,
    });
    await session.addEvent({ type: 'client-message', message });

    const validators = await getVersionedValidators(session.protocolVersion);

    // lookup method configuration from registry
    const handle = this.#handlers[methodToHandlerMap[message.method] ?? ''];
    const verify = validators.requests[message.method];

    if (!(handle && verify)) {
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
        message: `Unknown request: ${message.method}`,
      });
    }

    const { params } = verify(message);

    const controller = session.startRequest(message.id, message);
    const abort = controller.signal;

    try {
      const result = await handle(params, { abort, session });

      const responseMessage: JsonRpcResponseEnvelope = {
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result,
      };

      await session.reply(responseMessage);

      this.#log?.(
        'debug',
        `JSON-RPC request completed successfully: ${message.method}`,
        {
          messageId: message.id,
          messageMethod: message.method,
          request: message.params,
        },
      );
    } catch (exception) {
      await this.#handleMessageError({ message, exception, session });
    } finally {
      session.endRequest(message.id);
    }
  }

  /**
   * handles incoming json-rpc notification messages by routing them to appropriate handlers
   * @param message json-rpc notification envelope
   * @param session current client session
   * @throws {JsonRpcError} when notification method is unknown
   */
  public async handleNotificationMessage(
    message: JsonRpcNotificationEnvelope,
    session: Session,
  ): Promise<void> {
    try {
      this.#log?.(
        'debug',
        `processing JSON-RPC notification: ${message.method}`,
        { notification: message.method, params: message.params },
      );
      await session.addEvent({ type: 'client-message', message });

      // get the appropriate validator for the session's protocol version
      const validator = await getVersionedValidators(session.protocolVersion);

      // route message to appropriate handler based on method name
      switch (message.method) {
        case 'notifications/initialized':
          validator.notifications[message.method](message);

          // client confirms initialization is complete - no action needed
          break;
        case 'notifications/cancelled': {
          const {
            params: { requestId },
          } = validator.notifications[message.method](message);

          // client cancelled a request - abort the corresponding operation via session
          session.cancelRequest(requestId);

          break;
        }
        default:
          throw new JsonRpcError({
            code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
            message: `Unknown notification: ${message.method}`,
          });
      }

      this.#log?.(
        'debug',
        `JSON-RPC notification processed successfully: ${message.method}`,
        { notification: message.method },
      );
    } catch (exception) {
      await this.#handleMessageError({ message, exception, session });
    }
  }

  /**
   * handles errors that occur during message processing
   * @param context error context containing exception, message, and session
   * @param context.exception the error that occurred
   * @param context.message the json-rpc message being processed
   * @param context.session the current session
   */
  async #handleMessageError(context: {
    exception: unknown;
    message: JsonRpcMessage;
    session: Session;
  }): Promise<void> {
    const { message, exception, session } = context;

    this.#log?.('error', `failed to handle JSON-RPC message`, {
      id: message.id,
      method: message.method,
      error: jsonifyError(exception),
    });

    const errorMessage = createErrorMessageEnvelope(message.id, exception);

    await session.reply(errorMessage);
  }

  /**
   * broadcasts resource update notification to all subscribed sessions
   * @param uri resource uri that was updated
   */
  public async notifyResourceUpdate(uri: string): Promise<void> {
    const subscribers = this.#subscriptions.get(uri);

    if (!subscribers) {
      return;
    }

    await Promise.allSettled(
      [...subscribers].map(async (sessionId) => {
        const session = this.#activeSessions.get(sessionId)!;

        return session.reply({
          method: 'notifications/resources/updated',
          params: { uri },
        });
      }),
    );
  }

  /**
   * removes a session from the active list when the client disconnect
   * @param session session to remove
   */
  public async pauseSession(session: Session): Promise<void> {
    await session.addEvent({ type: 'channel-ended' });

    // remove from active sessions
    this.#activeSessions.delete(session.id);

    // remove from all subscriptions
    for (const uri of session.subscriptions) {
      this.#subscriptions.get(uri)?.delete(session.id);
    }
  }

  /**
   * cleans up sessions inactive for specified duration
   *
   * removes sessions that have not had any activity (events) within the specified
   * timeout period. useful for preventing resource leaks from abandoned sessions.
   * @param inactivityTimeoutMs milliseconds of inactivity threshold (default: 300000 = 5 minutes)
   * @returns number of sessions cleaned up
   * @example
   * ```typescript
   * // clean up sessions inactive for more than 5 minutes (default)
   * const count = mcpServer.cleanupInactiveSessions();
   *
   * // clean up sessions inactive for more than 1 hour
   * const count = mcpServer.cleanupInactiveSessions(3600000);
   * ```
   */
  public cleanupInactiveSessions(
    inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
  ): number {
    const now = Date.now();
    let count = 0;

    for (const [sessionId, session] of this.#activeSessions) {
      // get last activity time from session events
      const events = session.events;
      const lastEvent = events[events.length - 1];
      /* istanbul ignore next - recordedAt is always set by Session, fallback is defensive */
      const lastActivity = lastEvent.recordedAt ?? now;

      // check if session has been inactive longer than threshold
      if (now - lastActivity >= inactivityTimeoutMs) {
        // remove from active sessions
        this.#activeSessions.delete(sessionId);

        // remove from storage
        void this.#sessionStorage?.drop(sessionId);

        // unsubscribe from all resources
        cleanupSessionSubscriptions(
          this.#subscriptions,
          sessionId,
          session.subscriptions,
        );

        count++;
        this.#log?.('info', 'inactive session cleaned up', {
          sessionId,
          inactivityTimeoutMs,
        });
      }
    }

    if (count > 0) {
      this.#log?.('info', 'session cleanup completed', {
        sessionsCleanedUp: count,
        inactivityTimeoutMs,
      });
    }

    return count;
  }

  /**
   * resumes an existing session or creates a new one
   * @param context connection context for the session
   * @returns the resumed or new session
   */
  async #resumeSession(context: ConnectionContext): Promise<Session> {
    const sessionId = context.sessionId;

    if (!sessionId) {
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_REQUEST,
        message: 'Session ID is required',
      });
    }

    // check active sessions first (in-memory fast path)
    const activeSession = this.#activeSessions.get(sessionId);

    if (activeSession) {
      // verify user authorization (if session has userId)
      validateSessionOwnership(activeSession.userId, context.userId);

      // update channel context for this connection
      activeSession.channel = {
        id: context.channelId,
        side: 'server',
        write: async (notification) => context.write(notification),
      };

      // NOTE: do not add 'channel-started' event for active sessions
      // as the channel is already active and this is just updating the write function
      // await activeSession.addEvent({ type: 'channel-started' });

      return activeSession;
    }

    // fallback to storage for resumed/persisted sessions
    const storedSession = await retrieveAndValidateStoredSession(
      sessionId,
      this.#sessionStorage,
      context.userId,
    );

    const session = new Session(storedSession, {
      channel: {
        id: context.channelId,
        side: 'server',
        write: async (notification) => context.write(notification),
      },
      store: this.#sessionStorage,
      hooks: {
        onSubscribe: (uri) =>
          subscribeToResource(this.#subscriptions, uri, session.id),
        onUnsubscribe: /* istanbul ignore next */ (uri) =>
          unsubscribeFromResource(this.#subscriptions, uri, session.id),
      },
    });

    await session.addEvent({ type: 'channel-started' });

    return session;
  }
}
