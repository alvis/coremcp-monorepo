import { generateBase62Uuid } from '#id';

import {
  createRequestFromEvent,
  extractMessageFromEvent,
  updateRequestFromResponse,
} from './event-processor';
import {
  getSortedEventsForRebuilding,
  initializeFromEvents,
} from './initializer';
import { createJsonRpcMessage } from './message';
import { removeByKey, upsertByKey } from './resource-mutation';
import {
  getUnsyncedEvents,
  mergeEvents,
  updateActivityTimestamps,
} from './sync';

import type {
  AppInfo,
  ClientCapabilities,
  JsonRpcMessage,
  JsonRpcRequestData,
  JsonRpcRequestEnvelope,
  Prompt,
  RequestId,
  Resource,
  ResourceTemplate,
  ServerCapabilities,
  Tool,
} from '@coremcp/protocol';

import type { SetOptional } from '#types';

import type { SessionStore } from './store';
import type {
  EventHook,
  SessionChannelContext,
  SessionContext,
  SessionData,
  SessionEvent,
  SessionRequest,
  SubscriptionHook,
} from './types';

/**
 * manages an mcp session with message tracking, request handling and resource management
 */
export class Session {
  /** unique session identifier */
  #id: string;
  /** user associated with this session */
  #user: string | null;

  /** negotiated mcp protocol version */
  #protocolVersion: string;

  /** client application information received during initialization */
  #clientInfo: AppInfo;
  /** server application information sent during initialization */
  #serverInfo: AppInfo;
  /** negotiated capabilities between client and server */
  #capabilities: {
    client: ClientCapabilities;
    server: ServerCapabilities;
  };

  /** available tools in this session */
  #tools: Tool[];
  /** available prompts in this session */
  #prompts: Prompt[];
  /** available resources in this session */
  #resources: Resource[];
  /** available resource templates in this session */
  #resourceTemplates: ResourceTemplate[];
  /** subscribed resource URIs */
  #subscriptions: Set<string>;
  #lastSyncedEventId: string | null = null;
  #events: SessionEvent[] = [];
  /** timestamp of first activity */
  #firstActivity: number | null = null;
  /** timestamp of last activity */
  #lastActivity: number | null = null;
  #requests = new Map<RequestId, SessionRequest>();
  /** active request controllers for cancellation - maps request ID to abort controller */
  #activeRequests = new Map<
    RequestId,
    {
      request: JsonRpcRequestData;
      controller: AbortController;
    }
  >();

  #store?: SessionStore;

  #onEvent?: EventHook;
  #onSubscribe?: SubscriptionHook;
  #onUnsubscribe?: SubscriptionHook;

  /** current channel context */
  public channel: SessionChannelContext;

  public save: () => Promise<void>;

  public reply: (message: Omit<JsonRpcMessage, 'jsonrpc'>) => Promise<void>;

  /**
   * creates new mcp session with unique identifier
   * @param data session configuration parameters
   * @param context session context including store and channel
   */
  constructor(data: SessionData, context: SessionContext) {
    this.#store = context.store;
    this.channel = context.channel;
    this.reply = async (data) => {
      const message = createJsonRpcMessage(data);
      await this.channel.write(message);
      await this.addEvent({
        type: 'server-message',
        channelId: this.channel.id,
        responseToRequestId: message.id,
        message,
      });
    };
    this.save = async () => context.store?.set(this.toJSON());
    this.#onSubscribe = context.hooks?.onSubscribe;
    this.#onUnsubscribe = context.hooks?.onUnsubscribe;

    this.#id = data.id;
    this.#user = data.userId;
    this.#protocolVersion = data.protocolVersion;
    this.#clientInfo = data.clientInfo;
    this.#serverInfo = data.serverInfo;
    this.#capabilities = data.capabilities;
    // use [...] to avoid mutation in data
    this.#tools = [...data.tools];
    this.#prompts = [...data.prompts];
    this.#resources = [...data.resources];
    this.#resourceTemplates = [...data.resourceTemplates];
    this.#subscriptions = new Set(data.subscriptions);

    // initialize timestamps and requests from events
    const init = initializeFromEvents(data);
    this.#events = init.events;
    this.#firstActivity = init.firstActivity;
    this.#lastActivity = init.lastActivity;
    this.#lastSyncedEventId = init.lastSyncedEventId;

    // rebuild requests from events
    for (const event of getSortedEventsForRebuilding(init.events)) {
      this.#updateRequestFromEvent(event);
    }
  }

  /** gets the session identifier */
  public get id(): string {
    return this.#id;
  }

  /** gets the user ID associated with this session */
  public get userId(): string | null {
    return this.#user;
  }

  /** gets the negotiated protocol version */
  public get protocolVersion(): string {
    return this.#protocolVersion;
  }

  /** gets the client application information */
  public get clientInfo(): AppInfo {
    return this.#clientInfo;
  }

  /** gets the server application information */
  public get serverInfo(): AppInfo {
    return this.#serverInfo;
  }

  /** gets the negotiated capabilities */
  public get capabilities(): {
    client: ClientCapabilities;
    server: ServerCapabilities;
  } {
    return this.#capabilities;
  }

  /** gets all available tools in this session */
  public get tools(): Tool[] {
    return [...this.#tools];
  }

  /**
   * sets the available tools for this session
   * @param tools record of tool identifiers to tool definitions
   */
  public set tools(tools: Record<string, Tool>) {
    this.#tools = Object.values(tools);
    this.#updateActivity();

    void this.reply({ method: 'notifications/tools/list_changed' });
  }

  /** gets all available prompts in this session */
  public get prompts(): Prompt[] {
    return [...this.#prompts];
  }

  /**
   * sets the available prompts for this session
   * @param prompts record of prompt names to prompt definitions
   */
  public set prompts(prompts: Record<string, Prompt>) {
    this.#prompts = Object.values(prompts);
    this.#updateActivity();

    void this.reply({ method: 'notifications/prompts/list_changed' });
  }

  /** gets all available resources in this session */
  public get resources(): Resource[] {
    return [...this.#resources];
  }

  /**
   * sets the available resources for this session
   * @param resources record of resource URIs to resource definitions
   */
  public set resources(resources: Record<string, Resource>) {
    this.#resources = Object.values(resources);
    this.#updateActivity();

    void this.reply({ method: 'notifications/resources/list_changed' });
  }

  /** gets all available resource templates in this session */
  public get resourceTemplates(): ResourceTemplate[] {
    return [...this.#resourceTemplates];
  }

  /**
   * sets the available resource templates for this session
   * @param resourceTemplates record of resource template URIs to resource template definitions
   */
  public set resourceTemplates(
    resourceTemplates: Record<string, ResourceTemplate>,
  ) {
    this.#resourceTemplates = Object.values(resourceTemplates);
    this.#updateActivity();

    void this.reply({
      method: 'notifications/resource_templates/list_changed',
    });
  }

  /**
   * gets all subscribed resource URIs
   * @returns array of subscribed resource URIs
   */
  public get subscriptions(): string[] {
    return [...this.#subscriptions];
  }

  /** gets the event history for this session */
  public get events(): SessionEvent[] {
    return [...this.#events];
  }

  /** timestamp of first activity in milliseconds, null for no activity */
  public get firstActivity(): number | null {
    return this.#firstActivity;
  }

  /** timestamp of last activity in milliseconds, null for no activity */
  public get lastActivity(): number | null {
    return this.#lastActivity;
  }

  /** gets all requests in this session */
  public get requests(): Record<RequestId, SessionRequest> {
    return Object.fromEntries(this.#requests);
  }

  /** gets the active requests map */
  public get activeRequests(): ReadonlyMap<
    RequestId,
    { request: JsonRpcRequestData; controller: AbortController }
  > {
    return this.#activeRequests;
  }

  /**
   * retrieves a request by its identifier
   * @param id request identifier to lookup
   * @returns the session request object
   * @throws {Error} when request with specified id is not found or was removed
   */
  public getRequest(id: RequestId): SessionRequest {
    const request = this.#requests.get(id);
    if (!request) {
      throw new Error(
        `Request not found: ${id}. Verify the request ID exists and hasn't been cleaned up. Use session.requests to list all available requests.`,
      );
    }

    return request;
  }

  /**
   * lists all available tools in this session
   * @returns array of tool definitions
   */
  public listTools(): Tool[] {
    return this.tools;
  }

  /**
   * adds a tool to this session
   * @param tool tool definition to add
   */
  public addTool(tool: Tool): void {
    upsertByKey(this.#tools, tool, (t) => t.name);
    this.#updateActivity();
    void this.reply({ method: 'notifications/tools/list_changed' });
  }

  /**
   * drops a tool from this session
   * @param name tool name to drop
   * @returns true if tool was dropped, false if not found
   */
  public dropTool(name: string): boolean {
    const { items, removed } = removeByKey(this.#tools, name, (t) => t.name);
    if (removed) {
      this.#tools = items;
      this.#updateActivity();
      void this.reply({ method: 'notifications/tools/list_changed' });
    }

    return removed;
  }

  /**
   * lists all available prompts in this session
   * @returns array of prompt definitions
   */
  public listPrompts(): Prompt[] {
    return this.prompts;
  }

  /**
   * adds a prompt to this session
   * @param prompt prompt definition to add
   */
  public addPrompt(prompt: Prompt): void {
    upsertByKey(this.#prompts, prompt, (p) => p.name);
    this.#updateActivity();
    void this.reply({ method: 'notifications/prompts/list_changed' });
  }

  /**
   * drops a prompt from this session
   * @param name prompt name to drop
   * @returns true if prompt was dropped, false if not found
   */
  public dropPrompt(name: string): boolean {
    const { items, removed } = removeByKey(this.#prompts, name, (p) => p.name);
    if (removed) {
      this.#prompts = items;
      this.#updateActivity();
      void this.reply({ method: 'notifications/prompts/list_changed' });
    }

    return removed;
  }

  /**
   * lists all available resources in this session
   * @returns array of resource definitions
   */
  public listResources(): Resource[] {
    return this.resources;
  }

  /**
   * adds a resource to this session
   * @param resource resource definition to add
   */
  public addResource(resource: Resource): void {
    upsertByKey(this.#resources, resource, (r) => r.uri);
    this.#updateActivity();
    void this.reply({ method: 'notifications/resources/list_changed' });
  }

  /**
   * drops a resource from this session
   * @param uri resource URI to drop
   * @returns true if resource was dropped, false if not found
   */
  public dropResource(uri: string): boolean {
    const { items, removed } = removeByKey(this.#resources, uri, (r) => r.uri);
    if (removed) {
      this.#resources = items;
      this.#updateActivity();
      void this.reply({ method: 'notifications/resources/list_changed' });
    }

    return removed;
  }

  /**
   * subscribes to a resource URI
   * @param uri resource URI to subscribe to
   */
  public subscribeResource(uri: string): void {
    void this.#onSubscribe?.(uri);
    this.#subscriptions.add(uri);
    this.#updateActivity();
  }

  /**
   * unsubscribes from a resource URI
   * @param uri resource URI to unsubscribe from
   */
  public unsubscribeResource(uri: string): void {
    void this.#onUnsubscribe?.(uri);
    const wasRemoved = this.#subscriptions.delete(uri);
    if (wasRemoved) {
      this.#updateActivity();
    }
  }

  /**
   * lists all available resource templates in this session
   * @returns array of resource template definitions
   */
  public listResourceTemplates(): ResourceTemplate[] {
    return this.resourceTemplates;
  }

  /**
   * adds a resource template to this session
   * @param resourceTemplate resource template definition to add
   */
  public addResourceTemplate(resourceTemplate: ResourceTemplate): void {
    upsertByKey(
      this.#resourceTemplates,
      resourceTemplate,
      (rt) => rt.uriTemplate,
    );
    this.#updateActivity();
    void this.reply({
      method: 'notifications/resource_templates/list_changed',
    });
  }

  /**
   * drops a resource template from this session
   * @param uriTemplate resource template URI template to drop
   * @returns true if resource template was dropped, false if not found
   */
  public dropResourceTemplate(uriTemplate: string): boolean {
    const { items, removed } = removeByKey(
      this.#resourceTemplates,
      uriTemplate,
      (rt) => rt.uriTemplate,
    );
    if (removed) {
      this.#resourceTemplates = items;
      this.#updateActivity();
      void this.reply({
        method: 'notifications/resource_templates/list_changed',
      });
    }

    return removed;
  }

  /**
   * adds an event to the session history
   * @param partial session event data with optional id, channelId and timestamp
   * @param options additional options for event handling
   * @param options.skipSave whether to skip automatic saving after adding the event
   */
  public async addEvent(
    partial: SetOptional<SessionEvent, 'id' | 'channelId' | 'occurredAt'>,
    options?: { skipSave?: boolean },
  ): Promise<void> {
    const {
      id = generateBase62Uuid(),
      channelId = this.channel.id,
      occurredAt: timestamp = Date.now(),
      ...rest
    } = partial;

    const event: SessionEvent = {
      id,
      channelId,
      occurredAt: timestamp,
      ...rest,
    };
    this.#events.push(event);

    // NOTE: events may be synced back from storage, so some events may be in the past
    const timestamps = updateActivityTimestamps(
      event,
      this.#firstActivity,
      this.#lastActivity,
    );
    this.#firstActivity = timestamps.firstActivity;
    this.#lastActivity = timestamps.lastActivity;

    this.#updateRequestFromEvent(event);
    this.#onEvent?.(event);

    if (!options?.skipSave) {
      await this.sync();
    }
  }

  /**
   * synchronizes session events with the store
   * @returns array of new events retrieved from the store
   */
  public async sync(): Promise<SessionEvent[]> {
    const unsyncedEvents = getUnsyncedEvents(
      this.#events,
      this.#lastSyncedEventId,
    );

    // IMPORTANT: pull before push to avoid downloading our own unsynced events
    const newEvents =
      (await this.#store?.pullEvents(
        this.#id,
        this.events[this.events.length - 1].id,
      )) ?? [];

    for (const event of newEvents) {
      await this.addEvent(event, { skipSave: true });
    }

    await this.#store?.pushEvents(this.#id, unsyncedEvents);

    const merged = mergeEvents(this.#events, newEvents);
    this.#events = merged.events;
    this.#lastSyncedEventId = merged.lastSyncedEventId;

    return newEvents;
  }

  /**
   * starts tracking a request by creating and storing an abort controller
   * @param id request identifier
   * @param request json-rpc request envelope
   * @returns the abort controller for the request
   */
  public startRequest(
    id: RequestId,
    request: JsonRpcRequestEnvelope,
  ): AbortController {
    const controller = new AbortController();
    this.#activeRequests.set(id, { controller, request });

    return controller;
  }

  /**
   * ends tracking of a request and removes its abort controller
   * @param id request identifier
   * @returns true if the request was being tracked, false otherwise
   */
  public endRequest(id: RequestId): boolean {
    return this.#activeRequests.delete(id);
  }

  /**
   * cancels a request by aborting its controller if it exists
   * @param id request identifier
   */
  public cancelRequest(id: RequestId): void {
    const controller = this.#activeRequests.get(id)?.controller;
    if (controller) {
      controller.abort();
      this.#activeRequests.delete(id);
      void this.addEvent({ type: 'abort' });
    }
  }

  /**
   * updates request state based on an event
   * @param event session event that may affect request state
   */
  #updateRequestFromEvent(event: SessionEvent): void {
    const message = extractMessageFromEvent(event);
    if (!message || !('id' in message)) {
      return;
    }

    const requestId = message.id as RequestId;

    if ('method' in message) {
      this.#requests.set(
        requestId,
        createRequestFromEvent(event, message as JsonRpcRequestData),
      );
    } else {
      const request = this.#requests.get(requestId);
      if (request) {
        updateRequestFromResponse(request, event, message);
      }
    }
  }

  /** updates last activity timestamp to current time */
  #updateActivity(): void {
    this.#lastActivity = Date.now();
    void this.save();
  }

  /**
   * exports all current session state as a json-compatible object
   * @returns session state object suitable for json serialization
   */
  public toJSON(): SessionData {
    return {
      id: this.#id,
      userId: this.#user,
      protocolVersion: this.#protocolVersion,
      clientInfo: this.#clientInfo,
      serverInfo: this.#serverInfo,
      capabilities: this.#capabilities,
      tools: [...this.#tools],
      prompts: [...this.#prompts],
      resources: [...this.#resources],
      resourceTemplates: [...this.#resourceTemplates],
      subscriptions: [...this.#subscriptions],
      events: [...this.#events],
    };
  }
}
