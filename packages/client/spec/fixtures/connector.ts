/**
 * @file test connector fixture for McpConnector testing
 * @module spec/fixtures/connector
 * @description
 * provides a concrete TestConnector implementation for testing the abstract
 * McpConnector class. exposes protected methods and captures sent messages.
 */

import { JSONRPC_VERSION } from '@coremcp/protocol';

import { McpConnector } from '#connector';
import {
  connect,
  disconnect,
  initializeRequest,
  onMessage,
  send,
  status,
} from '#constants';

import {
  testClientCapabilities,
  testClientInfo,
  testInitializeResult,
} from './test-data';

import type {
  InitializeResult,
  JsonRpcMessage,
  JsonRpcRequestEnvelope,
} from '@coremcp/protocol';

import type { McpConnectorParams, Status } from '#types';

// CONSTANTS //

const TEST_SERVER_NAME = 'test-connector';

// TYPES //

/** parameters for TestConnector with optional transport hooks */
export interface TestConnectorParams extends McpConnectorParams {
  /** hook called when connect is invoked */
  onTransportConnect?: () => Promise<void>;
  /** hook called when disconnect is invoked */
  onTransportDisconnect?: () => Promise<void>;
  /** hook called when a message is sent */
  onTransportSend?: (message: JsonRpcMessage) => Promise<void>;
}

// CLASSES //

/**
 * test implementation of McpConnector for unit testing.
 * exposes protected methods and captures sent messages for verification.
 */
export class TestConnector extends McpConnector {
  /** all messages sent via the transport */
  public readonly sentMessages: JsonRpcMessage[] = [];

  /** hook for custom connect behavior */
  readonly #onTransportConnect?: () => Promise<void>;

  /** hook for custom disconnect behavior */
  readonly #onTransportDisconnect?: () => Promise<void>;

  /** hook for custom send behavior */
  readonly #onTransportSend?: (message: JsonRpcMessage) => Promise<void>;

  constructor(params: TestConnectorParams) {
    const {
      onTransportConnect,
      onTransportDisconnect,
      onTransportSend,
      ...baseParams
    } = params;
    super(baseParams);
    this.#onTransportConnect = onTransportConnect;
    this.#onTransportDisconnect = onTransportDisconnect;
    this.#onTransportSend = onTransportSend;
  }

  /**
   * simulate receiving a message from the server.
   * exposes the protected onMessage handler for testing.
   * @param message the message to receive
   */
  public async receiveMessage(message: JsonRpcMessage): Promise<void> {
    return this[onMessage](message);
  }

  /**
   * get the current initialize request envelope for verification.
   */
  public getInitializeRequest(): JsonRpcRequestEnvelope {
    return this[initializeRequest];
  }

  /**
   * get the internal status symbol value for testing status transitions.
   */
  public getInternalStatus(): Status {
    return this[status];
  }

  /**
   * set the internal status symbol value for testing.
   * @param newStatus the new status to set
   */
  public setInternalStatus(newStatus: Status): void {
    this[status] = newStatus;
  }

  /**
   * clear captured messages for test isolation.
   */
  public clearSentMessages(): void {
    this.sentMessages.length = 0;
  }

  /** implement abstract connect - calls optional hook and sends initialize request */
  protected async [connect](): Promise<void> {
    await this.#onTransportConnect?.();
    // subclasses must send the initialize request after connecting transport
    await this[send](this[initializeRequest]);
  }

  /** implement abstract disconnect - calls optional hook */
  protected async [disconnect](): Promise<void> {
    await this.#onTransportDisconnect?.();
  }

  /**
   * implement abstract send - captures message and calls optional hook
   * @param message the message to send
   */
  protected async [send](message: JsonRpcMessage): Promise<void> {
    this.sentMessages.push(message);
    await this.#onTransportSend?.(message);
  }
}

// HELPERS //

/**
 * creates a test connector with default parameters
 * @param overrides optional parameter overrides
 * @returns configured TestConnector instance
 */
export const createConnector = (
  overrides: Partial<TestConnectorParams> = {},
): TestConnector => {
  return new TestConnector({
    name: TEST_SERVER_NAME,
    clientInfo: testClientInfo,
    capabilities: testClientCapabilities,
    ...overrides,
  });
};

/**
 * creates a connector with auto-responding initialize handler
 * @param overrides optional parameter overrides
 * @returns configured TestConnector instance with initialize auto-response
 */
export const createAutoConnector = (
  overrides: Partial<TestConnectorParams> = {},
): TestConnector => {
  const connector = new TestConnector({
    name: TEST_SERVER_NAME,
    clientInfo: testClientInfo,
    capabilities: testClientCapabilities,
    onTransportSend: async (message: JsonRpcMessage) => {
      if ('method' in message && message.method === 'initialize') {
        await connector.receiveMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result: testInitializeResult,
        } as JsonRpcMessage);
      }
    },
    ...overrides,
  });

  return connector;
};

/**
 * creates a connector that auto-responds to initialize and a specific method
 * @param method the method name to respond to
 * @param result the result to return for the method
 * @returns configured TestConnector instance
 */
export const createMethodResponder = (
  method: string,
  result: Record<string, unknown>,
): TestConnector => {
  const connector = new TestConnector({
    name: TEST_SERVER_NAME,
    clientInfo: testClientInfo,
    capabilities: testClientCapabilities,
    onTransportSend: async (message: JsonRpcMessage) => {
      if ('method' in message && message.method === 'initialize') {
        await connector.receiveMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result: testInitializeResult,
        } as JsonRpcMessage);
      } else if ('method' in message && message.method === method) {
        await connector.receiveMessage({
          jsonrpc: JSONRPC_VERSION,
          id: message.id,
          result,
        } as JsonRpcMessage);
      }
    },
  });

  return connector;
};

/**
 * connects a connector and verifies connection success
 * @param connector the connector to connect
 * @returns initialization result
 */
export const connectConnector = async (
  connector: TestConnector,
): Promise<InitializeResult> => {
  const result = await connector.connect();

  return result;
};
