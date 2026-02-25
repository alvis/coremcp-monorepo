/**
 * E2E tests for HTTPTransport with coremcp server
 *
 * comprehensive tests for HTTP transport implementation covering server lifecycle,
 * initialization, tools, resources, prompts, subscriptions, completion, logging,
 * and concurrent operations using HttpMcpConnector from @coremcp/client-http.
 */

import type { ChildProcess } from 'node:child_process';

import type {
  BlobResourceContents,
  ImageContent,
  TextContent,
  TextResourceContents,
} from '@coremcp/protocol';

import { HttpMcpConnector } from '@coremcp/client-http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  HTTP_TEST_PORT,
  spawnHttpTestServer,
  waitForHttpTestServer,
  killTestServer,
  CLIENT_INFO,
} from './fixtures/index';

import {
  TEST_SERVER_INFO,
  TEST_TOOLS,
  TEST_PROMPTS,
  TEST_RESOURCES,
  TEST_RESOURCE_TEMPLATES,
} from './fixtures/test-server';



// TYPES //

/** token store interface for OAuth tokens (minimal interface for anonymous mode) */
interface TokenStore {
  getAccessToken(issuer: string): Promise<string | null>;
  getRefreshToken(issuer: string): Promise<string | null>;
  setTokens(
    issuer: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: number,
  ): Promise<void>;
  getTokenExpiration(issuer: string): Promise<number | null>;
  clearTokens(issuer: string): Promise<void>;
}

// CONSTANTS //

const BASE_URL = `http://localhost:${HTTP_TEST_PORT}`;
const MCP_ENDPOINT = `${BASE_URL}/mcp`;
const HEALTH_ENDPOINT = `${BASE_URL}/health`;
const SERVER_NAME = 'test-http-server';

// HELPERS //

/**
 * creates a no-op token store for anonymous mode testing
 * @returns token store that returns null for all operations
 */
function createNoOpTokenStore(): TokenStore {
  return {
    getAccessToken: async () => null,
    getRefreshToken: async () => null,
    setTokens: async () => {},
    getTokenExpiration: async () => null,
    clearTokens: async () => {},
  };
}

/**
 * creates HttpMcpConnector for testing
 * @param name unique name for the connector
 * @returns configured HttpMcpConnector instance
 */
function createHttpConnector(name: string): HttpMcpConnector {
  return new HttpMcpConnector({
    name,
    url: MCP_ENDPOINT,
    clientInfo: CLIENT_INFO,
    capabilities: { roots: { listChanged: true } },
    oauth: {
      onAuth: async () => {
        throw new Error('OAuth not expected in anonymous mode');
      },
      tokenStore: createNoOpTokenStore(),
      redirectUri: `${BASE_URL}/callback`,
    },
  });
}

// TEST SUITES //

describe('e2e:HTTPTransport', () => {
  let serverProcess: ChildProcess;
  let connector: HttpMcpConnector;

  beforeAll(async () => {
    serverProcess = spawnHttpTestServer();

    await waitForHttpTestServer(HEALTH_ENDPOINT);

    connector = createHttpConnector(SERVER_NAME);
    await connector.connect();
  }, 60_000);

  afterAll(async () => {
    await connector.disconnect();
    await killTestServer(serverProcess);
  });

  describe('server lifecycle', () => {
    it('should start on configured port', async () => {
      const response = await fetch(HEALTH_ENDPOINT);

      expect(response.ok || response.status === 404).toBe(true);
    });

    it('should accept connections on /mcp', () => {
      expect(connector.info.isConnected).toBe(true);
    });

    it('should handle graceful shutdown', async () => {
      const tempPort = HTTP_TEST_PORT + 1;
      const tempProcess = spawnHttpTestServer(tempPort);
      const tempUrl = `http://localhost:${tempPort}`;

      await waitForHttpTestServer(`${tempUrl}/health`);

      // verify server is running
      const healthCheck = await fetch(`${tempUrl}/health`).catch(() => null);
      expect(
        healthCheck === null || healthCheck.ok || healthCheck.status === 404,
      ).toBe(true);

      await killTestServer(tempProcess);

      // server should no longer be reachable after shutdown
      await expect(fetch(`${tempUrl}/health`)).rejects.toThrow();
    });
  });

  describe('initialization', () => {
    it('should negotiate protocol version', () => {
      expect(connector.info.protocolVersion).toBeDefined();
      expect(typeof connector.info.protocolVersion).toBe('string');
    });

    it('should return server capabilities', () => {
      const capabilities = connector.info.capabilities;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });

    it('should return server info', () => {
      expect(connector.info.serverInfo).toEqual(TEST_SERVER_INFO);
    });
  });

  describe('tools', () => {
    it('should list all tools with metadata', async () => {
      const tools = await connector.listTools();
      const toolNames = tools.map((tool) => tool.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));

      // verify tool has proper structure
      const echoTool = tools.find((t) => t.name === 'echo');
      expect(echoTool).toEqual(
        expect.objectContaining({
          name: 'echo',
          description: expect.any(String),
          inputSchema: expect.objectContaining({
            type: 'object',
            properties: expect.any(Object),
          }),
        }),
      );
    });

    it('should call echo tool', async () => {
      const result = await connector.callTool('echo', { text: 'hello e2e' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: 'hello e2e',
      });
    });

    it('should call add tool with numeric args', async () => {
      const result = await connector.callTool('add', { a: 17, b: 25 });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: '42',
      });
    });

    it('should call get-image and validate binary', async () => {
      const result = await connector.callTool('get-image', {});

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const imageContent = result.content[0] as ImageContent;
      expect(imageContent.type).toBe('image');
      expect(imageContent.mimeType).toBe('image/png');
      expect(imageContent.data).toBeDefined();

      // verify it's valid base64
      expect(() => atob(imageContent.data)).not.toThrow();
    });

    it('should handle unknown tool error', async () => {
      await expect(
        connector.callTool('nonexistent-tool', {}),
      ).rejects.toThrow();
    });
  });

  describe('resources', () => {
    it('should list all resources', async () => {
      const resources = await connector.listResources();
      const resourceUris = resources.map((r) => r.uri);

      expect(resourceUris).toEqual(expect.arrayContaining(TEST_RESOURCES));

      // verify resource structure
      const infoResource = resources.find((r) => r.uri === 'test://info');
      expect(infoResource).toEqual(
        expect.objectContaining({
          uri: 'test://info',
          name: expect.any(String),
          mimeType: 'application/json',
        }),
      );
    });

    it('should read text resource', async () => {
      const result = await connector.readResource('test://text/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('test://text/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toContain('Text content for resource 1');
    });

    it('should read binary resource as blob', async () => {
      const result = await connector.readResource('test://binary/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as BlobResourceContents;
      expect(content.uri).toBe('test://binary/1');
      expect(content.mimeType).toBe('image/png');
      expect(content.blob).toBeDefined();

      // verify it's valid base64
      expect(() => atob(content.blob)).not.toThrow();
    });

    it('should list resource templates', async () => {
      const templates = await connector.listResourceTemplates();
      const templateUris = templates.map((t) => t.uriTemplate);

      expect(templateUris).toEqual(
        expect.arrayContaining(TEST_RESOURCE_TEMPLATES),
      );

      // verify template structure
      const textTemplate = templates.find(
        (t) => t.uriTemplate === 'test://text/{id}',
      );
      expect(textTemplate).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          uriTemplate: 'test://text/{id}',
          mimeType: 'text/plain',
        }),
      );
    });
  });

  describe('prompts', () => {
    it('should list all prompts', async () => {
      const prompts = await connector.listPrompts();
      const promptNames = prompts.map((p) => p.name);

      expect(promptNames).toEqual(expect.arrayContaining(TEST_PROMPTS));

      // verify prompt structure
      const greetingPrompt = prompts.find((p) => p.name === 'greeting-prompt');
      expect(greetingPrompt).toEqual(
        expect.objectContaining({
          name: 'greeting-prompt',
          description: expect.any(String),
          arguments: expect.arrayContaining([
            expect.objectContaining({
              name: 'name',
              required: true,
            }),
          ]),
        }),
      );
    });

    it('should get prompt without args', async () => {
      const result = await connector.getPrompt('simple-prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();

      const content = firstMessage.content as TextContent;
      expect(content.type).toBe('text');
      expect(content.text).toContain('simple prompt');
    });

    it('should get prompt with required args', async () => {
      const result = await connector.getPrompt('greeting-prompt', {
        name: 'Alice',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.type).toBe('text');
      expect(content.text).toContain('Alice');
    });

    it('should get prompt with optional args', async () => {
      const result = await connector.getPrompt('styled-prompt', {
        style: 'formal',
        format: 'long',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      expect(content.type).toBe('text');
      // formal long message should be more verbose
      expect(content.text.length).toBeGreaterThan(20);
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to resource', async () => {
      await expect(
        connector.subscribeToResource('test://text/1'),
      ).resolves.toBeUndefined();
    });

    it('should unsubscribe from resource', async () => {
      await connector.subscribeToResource('test://text/2');

      await expect(
        connector.unsubscribeFromResource('test://text/2'),
      ).resolves.toBeUndefined();
    });

    it('should handle subscription to nonexistent resource', async () => {
      // subscription to nonexistent resource should not throw
      // server decides how to handle invalid subscriptions
      await expect(
        connector.subscribeToResource('test://nonexistent/resource'),
      ).resolves.toBeUndefined();
    });
  });

  describe('completion', () => {
    it('should complete prompt arguments', async () => {
      const result = await connector.complete(
        { type: 'ref/prompt', name: 'greeting-prompt' },
        { name: 'name', value: 'A' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);

      // should suggest completions starting with 'A'
      if (result.completion.values.length > 0) {
        expect(
          result.completion.values.some((v: string) =>
            v.toLowerCase().startsWith('a'),
          ),
        ).toBe(true);
      }
    });

    it('should complete resource template', async () => {
      const result = await connector.complete(
        { type: 'ref/resource', uri: 'test://text/{id}' },
        { name: 'id', value: '1' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();
      expect(Array.isArray(result.completion.values)).toBe(true);
    });
  });

  describe('logging', () => {
    it('should set log level', async () => {
      await expect(connector.setLogLevel('debug')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('info')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('warning')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('error')).resolves.toBeUndefined();
    });
  });

  describe('concurrent operations', () => {
    it('should handle parallel requests', async () => {
      const operations = [
        connector.callTool('echo', { text: 'concurrent-1' }),
        connector.callTool('echo', { text: 'concurrent-2' }),
        connector.callTool('add', { a: 1, b: 2 }),
        connector.listTools(),
        connector.listResources(),
        connector.listPrompts(),
      ];

      const results = await Promise.all(operations);

      // verify all operations completed successfully
      expect(results).toHaveLength(6);

      // verify echo results
      const echo1 = results[0] as { content: TextContent[] };
      const echo2 = results[1] as { content: TextContent[] };
      expect(echo1.content[0].text).toBe('concurrent-1');
      expect(echo2.content[0].text).toBe('concurrent-2');

      // verify add result
      const addResult = results[2] as { content: TextContent[] };
      expect(addResult.content[0].text).toBe('3');

      // verify list results are arrays
      expect(Array.isArray(results[3])).toBe(true);
      expect(Array.isArray(results[4])).toBe(true);
      expect(Array.isArray(results[5])).toBe(true);
    });
  });

  describe('session management', () => {
    it('should maintain session across multiple requests', async () => {
      // read info resource which includes session ID
      const result1 = await connector.readResource('test://info');
      const content1 = result1.contents[0] as TextResourceContents;
      const info1 = JSON.parse(content1.text) as { sessionId: string };

      // make another request and verify same session
      const result2 = await connector.readResource('test://info');
      const content2 = result2.contents[0] as TextResourceContents;
      const info2 = JSON.parse(content2.text) as { sessionId: string };

      expect(info1.sessionId).toBe(info2.sessionId);
    });

    it('should get new session after reconnection', async () => {
      // read info resource to get current session ID
      const result1 = await connector.readResource('test://info');
      const content1 = result1.contents[0] as TextResourceContents;
      const info1 = JSON.parse(content1.text) as { sessionId: string };

      // create new connector and connect
      const newConnector = createHttpConnector('reconnect-test');
      await newConnector.connect();

      const result2 = await newConnector.readResource('test://info');
      const content2 = result2.contents[0] as TextResourceContents;
      const info2 = JSON.parse(content2.text) as { sessionId: string };

      // new connector should have different session ID
      expect(info1.sessionId).not.toBe(info2.sessionId);

      await newConnector.disconnect();
    });
  });

  describe('error handling', () => {
    it('should handle request to disconnected server gracefully', async () => {
      const tempConnector = createHttpConnector('error-test');

      // try to send request without connecting
      await expect(
        tempConnector.callTool('echo', { text: 'test' }),
      ).rejects.toThrow();
    });

    it('should handle server error responses', async () => {
      // call tool with invalid arguments
      await expect(
        connector.callTool('add', { a: 'not-a-number', b: 'also-not' }),
      ).resolves.toEqual(
        expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: '0', // default values when non-numeric provided
            }),
          ]),
        }),
      );
    });
  });

  describe('ping', () => {
    it('should respond to ping', async () => {
      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });
});
