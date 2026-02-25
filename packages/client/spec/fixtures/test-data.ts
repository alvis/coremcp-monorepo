/**
 * @file consolidated test data constants
 * @module spec/fixtures/test-data
 * @description
 * shared test constants used across multiple test suites including
 * client information, capabilities, and initialization results.
 * consolidates duplicate test data from client.spec.ts, transport.spec.ts,
 * and server.spec.ts
 */

import type {
  ClientCapabilities,
  Implementation,
  InitializeResult,
} from '@coremcp/protocol';

/** standard test client implementation information */
export const testClientInfo: Implementation = {
  name: 'test-client',
  version: '1.0.0',
};

/** standard test client capabilities */
export const testClientCapabilities: ClientCapabilities = {
  roots: { listChanged: true },
};

/** standard test server initialization result */
export const testInitializeResult: InitializeResult = {
  protocolVersion: '2025-06-18',
  capabilities: {
    tools: { listChanged: true },
    prompts: { listChanged: true },
    resources: { listChanged: true, subscribe: true },
    logging: {},
  },
  serverInfo: {
    name: 'test-server',
    version: '1.0.0',
  },
};

/** standard test server name */
export const testServerName = 'test-server';
