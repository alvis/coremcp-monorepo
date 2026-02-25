import type {
  JsonRpcRequestData,
  JsonRpcRequestEnvelope,
} from '@coremcp/protocol';

/**
 * represents a pending json-rpc request with its metadata
 * @template T - the expected response type
 */
export interface PendingRequest<T = unknown> {
  /** timestamp when the request was initiated */
  startsAt: number;
  /** core request information (id and method) */
  request: Pick<JsonRpcRequestEnvelope, 'id' | 'method'>;
  /** promise that resolves when the request completes */
  promise: Promise<T>;
  /** function to resolve the request promise */
  resolve: (value: T | PromiseLike<T>) => void;
  /** function to reject the request promise */
  reject: (reason?: Error) => void;
}

/** manages pending json-rpc requests and their lifecycle */
export class RequestManager {
  #nextId = 1;
  #pendingRequests = new Map<string | number, PendingRequest<unknown>>();

  /** gets the count of pending requests */
  public get pendingCount(): number {
    return this.#pendingRequests.size;
  }

  /**
   * creates a new request with unique id and promise resolvers
   * @param method - the json-rpc method name
   * @param params - optional request parameters
   * @returns object containing request id, message envelope, and promise
   * @template T - the expected response type
   */
  public createRequest<T = unknown>(
    method: string,
    params?: JsonRpcRequestData,
  ): {
    id: number;
    message: JsonRpcRequestEnvelope;
    promise: Promise<T>;
  } {
    const id = this.#nextId++;
    const message: JsonRpcRequestEnvelope = {
      jsonrpc: '2.0',
      id,
      method,
      params: {
        ...params,
        _meta: {
          progressToken: id,
        },
      },
    };

    const { resolve, reject, promise } = Promise.withResolvers<T>();
    this.#pendingRequests.set(id, {
      startsAt: Date.now(),
      request: { id, method },
      resolve: resolve as (value: unknown) => void,
      reject,
      promise,
    } as PendingRequest<unknown>);

    return { id, message, promise };
  }

  /**
   * registers an existing request (used for initialization)
   * @param id - unique identifier for the request
   * @param method - the json-rpc method name
   * @returns promise that resolves when the request completes
   * @template T - the expected response type
   */
  public async registerRequest<T = unknown>(
    id: number | string,
    method: string,
  ): Promise<T> {
    const { resolve, reject, promise } = Promise.withResolvers<T>();
    this.#pendingRequests.set(id, {
      startsAt: Date.now(),
      request: { id, method },
      resolve: resolve as (value: unknown) => void,
      reject,
      promise,
    } as PendingRequest<unknown>);

    return promise;
  }

  /**
   * resolves a pending request with result
   * @param id unique identifier of the request
   * @param result result data to resolve with
   * @returns true if request was found and resolved, false otherwise
   */
  public resolveRequest(id: string | number, result: unknown): boolean {
    const pending = this.#pendingRequests.get(id);
    if (!pending) {
      return false;
    }

    pending.resolve(result);
    this.#pendingRequests.delete(id);

    return true;
  }

  /**
   * rejects a pending request with error
   * @param id unique identifier of the request
   * @param reason error or rejection reason
   * @returns true if request was found and rejected, false otherwise
   */
  public rejectRequest(id: string | number, reason: Error): boolean {
    const pending = this.#pendingRequests.get(id);
    if (!pending) {
      return false;
    }

    pending.reject(reason);
    this.#pendingRequests.delete(id);

    return true;
  }

  /**
   * gets metadata for a pending request
   * @param id - unique identifier of the request
   * @returns pending request metadata or undefined if not found
   */
  public getRequest(id: string | number): PendingRequest | undefined {
    return this.#pendingRequests.get(id);
  }

  /**
   * gets the duration of a pending request in milliseconds
   * @param id - unique identifier of the request
   * @returns duration in milliseconds or undefined if request not found
   */
  public getRequestDuration(id: string | number): number | undefined {
    const pending = this.#pendingRequests.get(id);

    return pending ? Date.now() - pending.startsAt : undefined;
  }

  /** clears all pending requests */
  public clear(): void {
    this.#pendingRequests.clear();
  }

  /** resets the request id counter */
  public resetIdCounter(): void {
    this.#nextId = 1;
  }
}
