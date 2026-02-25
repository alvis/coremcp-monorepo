import type {
  JsonRpcMessage,
  JsonRpcRequestEnvelope,
  Prompt,
  RequestId,
  Resource,
  ResourceTemplate,
  Tool,
} from '@coremcp/protocol';

import { createSessionEvent, recordEvent } from './event-manager';
import {
  getSortedEventsForRebuilding,
  initializeFromEvents,
} from './initializer';
import { createJsonRpcMessage } from './message';
import { addPrompt, dropPrompt } from './prompt-manager';
import {
  cancelTracking,
  endTracking,
  startTracking,
  updateRequestFromEvent,
} from './request-manager';
import {
  addResource,
  addResourceTemplate,
  dropResource,
  dropResourceTemplate,
  subscribeResource,
  unsubscribeResource,
} from './resource-manager';
import { getUnsyncedEvents, mergeEvents } from './sync';
import { addTool, dropTool } from './tool-manager';

import type {
  ActiveRequestEntry,
  SessionContext,
  SessionData,
  SessionEvent,
  SessionEventInput,
  SessionRequest,
  SessionTimestamps,
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
  #clientInfo: SessionData['clientInfo'];
  /** server application information sent during initialization */
  #serverInfo: SessionData['serverInfo'];
  /** negotiated capabilities between client and server */
  #capabilities: SessionData['capabilities'];
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
  /** activity timestamps for first and last session activity */
  #timestamps: SessionTimestamps = { first: null, last: null };
  #requests = new Map<RequestId, SessionRequest>();
  /** active request controllers for cancellation - maps request ID to abort controller */
  #activeRequests = new Map<RequestId, ActiveRequestEntry>();
  #store?: SessionContext['store'];
  #hooks?: SessionContext['hooks'];

  /** current channel context */
  public channel: SessionContext['channel'];
  /** persists session state to store */
  public save: () => Promise<void>;
  /** sends a json-rpc message to the client */
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
    this.#hooks = context.hooks;
    this.#id = data.id;
    this.#user = data.userId;
    this.#protocolVersion = data.protocolVersion;
    this.#clientInfo = data.clientInfo;
    this.#serverInfo = data.serverInfo;
    this.#capabilities = data.capabilities;
    this.#tools = [...data.tools];
    this.#prompts = [...data.prompts];
    this.#resources = [...data.resources];
    this.#resourceTemplates = [...data.resourceTemplates];
    this.#subscriptions = new Set(data.subscriptions);

    const init = initializeFromEvents(data);
    this.#events = init.events;
    this.#timestamps = { first: init.firstActivity, last: init.lastActivity };
    this.#lastSyncedEventId = init.lastSyncedEventId;

    for (const event of getSortedEventsForRebuilding(init.events)) {
      updateRequestFromEvent(this.#requests, event);
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
  public get clientInfo(): SessionData['clientInfo'] {
    return this.#clientInfo;
  }

  /** gets the server application information */
  public get serverInfo(): SessionData['serverInfo'] {
    return this.#serverInfo;
  }

  /** gets the negotiated capabilities */
  public get capabilities(): SessionData['capabilities'] {
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
    this.#notify('notifications/tools/list_changed');
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
    this.#notify('notifications/prompts/list_changed');
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
    this.#notify('notifications/resources/list_changed');
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
    this.#notify('notifications/resource_templates/list_changed');
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
    return this.#timestamps.first;
  }

  /** timestamp of last activity in milliseconds, null for no activity */
  public get lastActivity(): number | null {
    return this.#timestamps.last;
  }

  /** gets all requests in this session */
  public get requests(): Record<RequestId, SessionRequest> {
    return Object.fromEntries(this.#requests);
  }

  /** gets the active requests map */
  public get activeRequests(): ReadonlyMap<RequestId, ActiveRequestEntry> {
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
   * adds a tool to this session
   * @param tool tool definition to add
   */
  public addTool(tool: Tool): void {
    this.#tools = addTool(this.#tools, tool);
    this.#notify('notifications/tools/list_changed');
  }

  /**
   * drops a tool from this session
   * @param name tool name to drop
   * @returns true if tool was dropped, false if not found
   */
  public dropTool(name: string): boolean {
    const removed = dropTool(this.#tools, name);
    if (removed) {
      this.#notify('notifications/tools/list_changed');
    }

    return removed;
  }

  /**
   * adds a prompt to this session
   * @param prompt prompt definition to add
   */
  public addPrompt(prompt: Prompt): void {
    this.#prompts = addPrompt(this.#prompts, prompt);
    this.#notify('notifications/prompts/list_changed');
  }

  /**
   * drops a prompt from this session
   * @param name prompt name to drop
   * @returns true if prompt was dropped, false if not found
   */
  public dropPrompt(name: string): boolean {
    const removed = dropPrompt(this.#prompts, name);
    if (removed) {
      this.#notify('notifications/prompts/list_changed');
    }

    return removed;
  }

  /**
   * adds a resource to this session
   * @param resource resource definition to add
   */
  public addResource(resource: Resource): void {
    this.#resources = addResource(this.#resources, resource);
    this.#notify('notifications/resources/list_changed');
  }

  /**
   * drops a resource from this session
   * @param uri resource URI to drop
   * @returns true if resource was dropped, false if not found
   */
  public dropResource(uri: string): boolean {
    const removed = dropResource(this.#resources, uri);
    if (removed) {
      this.#notify('notifications/resources/list_changed');
    }

    return removed;
  }

  /**
   * subscribes to a resource URI
   * @param uri resource URI to subscribe to
   */
  public subscribeResource(uri: string): void {
    subscribeResource(this.#subscriptions, uri, this.#hooks?.onSubscribe);
    this.#timestamps.last = Date.now();
    void this.save();
  }

  /**
   * unsubscribes from a resource URI
   * @param uri resource URI to unsubscribe from
   */
  public unsubscribeResource(uri: string): void {
    const hook = this.#hooks?.onUnsubscribe;
    if (unsubscribeResource(this.#subscriptions, uri, hook)) {
      this.#timestamps.last = Date.now();
      void this.save();
    }
  }

  /**
   * adds a resource template to this session
   * @param template resource template definition to add
   */
  public addResourceTemplate(template: ResourceTemplate): void {
    const rt = this.#resourceTemplates;
    this.#resourceTemplates = addResourceTemplate(rt, template);
    this.#notify('notifications/resource_templates/list_changed');
  }

  /**
   * drops a resource template from this session
   * @param uriTemplate resource template URI template to drop
   * @returns true if resource template was dropped, false if not found
   */
  public dropResourceTemplate(uriTemplate: string): boolean {
    const removed = dropResourceTemplate(this.#resourceTemplates, uriTemplate);
    if (removed) {
      this.#notify('notifications/resource_templates/list_changed');
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
    partial: SessionEventInput,
    options?: { skipSave?: boolean },
  ): Promise<void> {
    const event = createSessionEvent(partial, this.channel.id);
    recordEvent(
      this.#events,
      this.#requests,
      event,
      this.#timestamps,
      this.#hooks?.onEvent,
    );

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
    return startTracking(this.#activeRequests, id, request);
  }

  /**
   * ends tracking of a request and removes its abort controller
   * @param id request identifier
   * @returns true if the request was being tracked, false otherwise
   */
  public endRequest(id: RequestId): boolean {
    return endTracking(this.#activeRequests, id);
  }

  /**
   * cancels a request by aborting its controller if it exists
   * @param id request identifier
   */
  public cancelRequest(id: RequestId): void {
    if (cancelTracking(this.#activeRequests, id)) {
      void this.addEvent({ type: 'abort' });
    }
  }

  /**
   * updates activity timestamp and sends a notification
   * @param method the notification method to send
   */
  #notify(method: string): void {
    this.#timestamps.last = Date.now();
    void this.save();
    void this.reply({ method });
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
