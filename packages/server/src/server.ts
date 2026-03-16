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
import { DEFAULT_INACTIVITY_TIMEOUT_MS } from '#constants/defaults';
import { methodToHandlerMap, resolveHandlers } from '#handlers';
import {
  broadcastResourceUpdate,
  cleanupInactiveSessions,
  createSessionData,
  generateSessionId,
  handleMessageError,
  notifySessionInitialized,
  validateRequest,
  processNotification,
  replayUndeliveredEvents,
  streamSessionNotifications,
  validateSessionExists,
  resumeSession,
  subscribeToResource,
  unsubscribeFromResource,
} from '#utilities';

import type { Log, SessionStore } from '@coremcp/core';
import type {
  Implementation,
  InitializeRequest,
  JsonRpcMessage,
  JsonRpcNotificationEnvelope,
  JsonRpcRequestEnvelope,
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
  serverInfo: Implementation;
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
  #serverInfo: Implementation;
  /** logs server operations */
  #log?: Log;
  /** subscription management - maps resource uri to set of subscribed session ids */
  #subscriptions: SubscriptionMap = new Map();
  /** active sessions map for broadcasting notifications */
  #activeSessions = new Map<string, Session>();
  /** custom session ID generator function */
  #sessionIdGenerator?: () => string;
  /** optional usage instructions for the server */
  #instructions?: string;
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
    this.#instructions = params.instructions;

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
    return {
      pendingRequests: [...this.#activeSessions.values()].reduce(
        (total, session) => total + session.activeRequests.size,
        0,
      ),
      totalSessions: this.#activeSessions.size,
    };
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
      instructions: this.#instructions,
      tools: this.#tools,
      prompts: this.#prompts,
      resources: this.#resources,
      resourceTemplates: this.#resourceTemplates,
    });

    // store the new session to the store
    void this.#sessionStorage?.set(data);

    const session = new Session(data, {
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
    await session.addEvent({
      type: 'channel-started',
      channelId: context.channelId,
    });

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

    try {
      // FIRST REQUEST //
      if (message.method === 'initialize' && 'params' in message) {
        // validate initialization-specific parameters
        const initial = validateInitializeRequest(message);

        // create session with http transport context
        const session = await this.initializeSession(initial.params, context);

        /* istanbul ignore next - onInitialize callback is optional and tested separately */
        options?.onInitialize?.(session);

        return await this.handleRequestMessage({
          message,
          session,
          write: context.write,
          channelId: context.channelId,
        });
      }

      // OTHER CASES //

      const session = await this.#resumeSession(context);

      // handle SPECIAL CASE ping after session validation //
      if (message.method === 'ping' && message.id) {
        // NOTE: all ping messages will not be logged to the session
        return await context.write({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result: {},
        });
      }

      /* istanbul ignore next */
      if (message.result || message.error) {
        /* istanbul ignore next */
        return await session.addEvent({
          type: 'client-message',
          responseToRequestId: message.id,
          message,
        });
      }

      return message.id !== undefined
        ? await this.handleRequestMessage({
            message,
            session,
            write: context.write,
            channelId: context.channelId,
          })
        : await this.handleNotificationMessage(message, session);
    } catch (exception) {
      // errors from validateInitializeRequest, initializeSession, or resumeSession
      this.#log?.('error', `failed to handle JSON-RPC message`, {
        message,
        error: jsonifyError(exception),
      });

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

    const stopStreaming = streamSessionNotifications({
      session,
      context,
      sessionStorage: this.#sessionStorage,
    });

    void context.waitUntilClosed.then(async () => {
      // stop receiving notification when the connection is closed
      stopStreaming();
      this.#log?.('debug', `terminating notification broadcast`, { sessionId });

      // record the channel closure without removing the session from
      // active sessions so that subsequent POST requests can still
      // find the session via resumeSession
      await session.addEvent({
        type: 'channel-ended',
        channelId: context.channelId,
      });
    });

    /* istanbul ignore next */
    const replayed = await replayUndeliveredEvents({
      session,
      context,
      sessionStorage: this.#sessionStorage,
    });

    /* istanbul ignore next */
    if (replayed !== undefined) {
      return replayed;
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

    // clean up active session and remove from storage
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
   * @param context request context containing message, session, write function, and channel id
   * @param context.message
   * @param context.session
   * @param context.write
   * @param context.channelId
   */
  public async handleRequestMessage(context: {
    message: JsonRpcRequestEnvelope;
    session: Session;
    write: (msg: JsonRpcMessage) => Promise<void>;
    channelId: string;
  }): Promise<void> {
    const { message, session, write, channelId } = context;

    this.#log?.('debug', `processing JSON-RPC request: ${message.method}`, {
      messageId: message.id,
      messageMethod: message.method,
    });
    await session.addEvent({ type: 'client-message', channelId, message });

    const { signal: abort } = session.startRequest(message.id, message);

    try {
      const validators = await getVersionedValidators(session.protocolVersion);
      const handle = this.#handlers[methodToHandlerMap[message.method] ?? ''];
      const verify = validators.requests[message.method];

      if (!(handle && verify)) {
        throw new JsonRpcError({
          code: MCP_ERROR_CODES.METHOD_NOT_FOUND,
          message: `Unknown request: ${message.method}`,
        });
      }

      const { params } = validateRequest(verify, message);
      const result = await handle(params, { abort, session });

      const responseMessage: JsonRpcMessage = {
        jsonrpc: JSONRPC_VERSION,
        id: message.id,
        result,
      };
      await write(responseMessage);
      await session.addEvent({
        type: 'server-message',
        channelId,
        responseToRequestId: responseMessage.id,
        message: responseMessage,
      });

      this.#log?.('debug', `JSON-RPC request completed: ${message.method}`, {
        messageId: message.id,
        messageMethod: message.method,
      });
    } catch (exception) {
      await handleMessageError({
        message,
        exception,
        session,
        log: this.#log,
        write,
        channelId,
      });
    } finally {
      session.endRequest(message.id);
    }
  }

  /**
   * handles incoming json-rpc notification messages by routing them to appropriate handlers
   * @param message json-rpc notification envelope
   * @param session current client session
   * @returns promise that resolves when notification processing is complete
   * @throws {JsonRpcError} when notification method is unknown
   */
  public async handleNotificationMessage(
    message: JsonRpcNotificationEnvelope,
    session: Session,
  ): Promise<void> {
    return processNotification(message, session, this.#log);
  }

  /**
   * broadcasts resource update notification to all subscribed sessions
   * @param uri resource uri that was updated
   * @returns promise that resolves when all notifications are sent
   */
  public async notifyResourceUpdate(uri: string): Promise<void> {
    return broadcastResourceUpdate(
      this.#subscriptions,
      this.#activeSessions,
      uri,
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
   * @param inactivityTimeoutMs milliseconds of inactivity threshold (default: 300000 = 5 minutes)
   * @returns number of sessions cleaned up
   */
  public cleanupInactiveSessions(
    inactivityTimeoutMs = DEFAULT_INACTIVITY_TIMEOUT_MS,
  ): number {
    return cleanupInactiveSessions(
      {
        activeSessions: this.#activeSessions,
        subscriptions: this.#subscriptions,
        sessionStorage: this.#sessionStorage,
        log: this.#log,
      },
      inactivityTimeoutMs,
    );
  }

  /**
   * validates that a session exists for the given context
   * @param context connection context containing the session id to validate
   * @returns resolves when validation succeeds
   * @throws {JsonRpcError} with RESOURCE_NOT_FOUND when session does not exist
   */
  public async validateSession(context: ConnectionContext): Promise<void> {
    return validateSessionExists(context, {
      activeSessions: this.#activeSessions,
      sessionStorage: this.#sessionStorage,
    });
  }

  /**
   * resumes an existing session or creates a new one
   * @param context connection context for the session
   * @returns the resumed or new session
   */
  async #resumeSession(context: ConnectionContext): Promise<Session> {
    const session = await resumeSession(context, {
      activeSessions: this.#activeSessions,
      subscriptions: this.#subscriptions,
      sessionStorage: this.#sessionStorage,
    });
    this.#activeSessions.set(session.id, session);

    return session;
  }
}
