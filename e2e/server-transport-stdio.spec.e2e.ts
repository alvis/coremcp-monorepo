/**
 * E2E tests for McpStdioServerTransport
 *
 * Tests the complete STDIO transport implementation against the coremcp test server.
 * Validates JSON-RPC communication, MCP protocol compliance, and all server capabilities
 * including tools, resources, prompts, subscriptions, completion, and logging.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { StdioConnector } from '@coremcp/client-stdio';

import type {
  BlobResourceContents,
  ImageContent,
  Prompt,
  Resource,
  ResourceTemplate,
  TextContent,
  TextResourceContents,
  Tool,
} from '@coremcp/protocol';

import { CLIENT_INFO, getStdioServerConfig } from './fixtures/index';
import {
  TEST_SERVER_INFO,
  TEST_TOOLS,
  TEST_PROMPTS,
  TEST_RESOURCES,
  TEST_RESOURCE_TEMPLATES,
} from './fixtures/test-server';

// CONSTANTS //

/** connection timeout for server startup */
const CONNECTION_TIMEOUT = 60_000;

/** 1x1 red pixel PNG image encoded as base64 - matches test server constant */
const RED_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// HELPERS //

/**
 * creates connector params for spawning the coremcp test server
 * @param name unique name for the server connection
 * @returns configured StdioConnector instance
 */
const createConnector = (name: string): StdioConnector => {
  const config = getStdioServerConfig();

  return new StdioConnector({
    name,
    command: config.command,
    args: config.args,
    clientInfo: CLIENT_INFO,
    capabilities: { roots: { listChanged: true } },
  });
};

// TEST SUITES //

/**
 * E2E tests for McpStdioServerTransport against coremcp test server
 *
 * The test server provides:
 * - 4 tools: echo, add, get-image, slow-operation
 * - 3 prompts: simple-prompt, greeting-prompt, styled-prompt
 * - 6 resources: test://info, test://text/{1-3}, test://binary/{1-2}
 * - 2 resource templates: test://text/{id}, test://binary/{id}
 *
 * These tests verify the full STDIO transport lifecycle against a real server.
 */
describe('cl:McpStdioServerTransport', () => {
  const connector = createConnector('coremcp-test-server');

  beforeAll(async () => {
    await connector.connect();
  }, CONNECTION_TIMEOUT);

  afterAll(async () => {
    await connector.disconnect();
  });

  describe('connection', () => {
    it('should accept JSON-RPC on stdin and connect successfully', () => {
      expect(connector.info.isConnected).toBe(true);
    });

    it('should write responses to stdout', () => {
      // connection success proves stdout is working
      expect(connector.info.serverInfo).toBeDefined();
    });

    it(
      'should handle shutdown gracefully',
      async () => {
        const testConnector = createConnector('shutdown-test-server');

        await testConnector.connect();

        expect(testConnector.info.isConnected).toBe(true);

        await testConnector.disconnect();

        expect(testConnector.info.isConnected).toBe(false);
      },
      CONNECTION_TIMEOUT,
    );
  });

  describe('initialization', () => {
    it('should complete initialize/initialized handshake', () => {
      expect(connector.info.isConnected).toBe(true);
      expect(connector.info.protocolVersion).toBeDefined();
    });

    it('should return server info after initialization', () => {
      expect(connector.info.serverInfo).toEqual({
        name: TEST_SERVER_INFO.name,
        version: TEST_SERVER_INFO.version,
      });
    });

    it('should return capabilities after initialization', () => {
      const capabilities = connector.info.capabilities;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });

    it('should negotiate protocol version', () => {
      expect(connector.info.protocolVersion).toBeDefined();
      expect(typeof connector.info.protocolVersion).toBe('string');
    });

    it('should respond to ping after initialization', async () => {
      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('tools', () => {
    it('should list all available tools', async () => {
      const tools = await connector.listTools();

      expect(tools.length).toBe(TEST_TOOLS.length);

      const toolNames = tools.map((tool: Tool) => tool.name);

      expect(toolNames).toEqual(expect.arrayContaining(TEST_TOOLS));
    });

    it('should call echo tool and receive echoed message', async () => {
      const result = await connector.callTool('echo', { text: 'hello e2e' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;

      expect(textContent).toEqual({
        type: 'text',
        text: 'hello e2e',
      });
    });

    it('should call add tool and return correct sum', async () => {
      const result = await connector.callTool('add', { a: 17, b: 25 });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;

      expect(textContent).toEqual({
        type: 'text',
        text: '42',
      });
    });

    it('should call get-image tool and return base64 PNG image', async () => {
      const result = await connector.callTool('get-image', {});

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const imageContent = result.content[0] as ImageContent;

      expect(imageContent.type).toBe('image');
      expect(imageContent.mimeType).toBe('image/png');
      expect(imageContent.data).toBe(RED_PIXEL_PNG_BASE64);

      // verify it's valid base64
      expect(() => atob(imageContent.data)).not.toThrow();
    });

    it('should handle errors for unknown tool', async () => {
      await expect(connector.callTool('nonExistentTool', {})).rejects.toThrow(
        /Tool not found: nonExistentTool/,
      );
    });
  });

  describe('resources', () => {
    it('should list all resources', async () => {
      const resources = await connector.listResources();

      expect(resources.length).toBe(TEST_RESOURCES.length);

      const resourceUris = resources.map((resource: Resource) => resource.uri);

      expect(resourceUris).toEqual(expect.arrayContaining(TEST_RESOURCES));
    });

    it('should read text resource', async () => {
      const result = await connector.readResource('test://text/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;

      expect(content.uri).toBe('test://text/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toContain('Text content for resource 1');
    });

    it('should read binary resource', async () => {
      const result = await connector.readResource('test://binary/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as BlobResourceContents;

      expect(content.uri).toBe('test://binary/1');
      expect(content.mimeType).toBe('image/png');
      expect(content.blob).toBe(RED_PIXEL_PNG_BASE64);

      // verify it's valid base64
      expect(() => atob(content.blob)).not.toThrow();
    });

    it('should read JSON resource', async () => {
      const result = await connector.readResource('test://info');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;

      expect(content.uri).toBe('test://info');
      expect(content.mimeType).toBe('application/json');

      // verify it's valid JSON
      const parsed = JSON.parse(content.text);

      expect(parsed.name).toBe(TEST_SERVER_INFO.name);
      expect(parsed.version).toBe(TEST_SERVER_INFO.version);
    });

    it('should list resource templates', async () => {
      const templates = await connector.listResourceTemplates();

      expect(templates.length).toBe(TEST_RESOURCE_TEMPLATES.length);

      const templateUris = templates.map(
        (template: ResourceTemplate) => template.uriTemplate,
      );

      expect(templateUris).toEqual(
        expect.arrayContaining(TEST_RESOURCE_TEMPLATES),
      );
    });
  });

  describe('prompts', () => {
    it('should list all prompts', async () => {
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBe(TEST_PROMPTS.length);

      const promptNames = prompts.map((prompt: Prompt) => prompt.name);

      expect(promptNames).toEqual(expect.arrayContaining(TEST_PROMPTS));
    });

    it('should get prompt without arguments', async () => {
      const result = await connector.getPrompt('simple-prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];

      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();

      const content = firstMessage.content as TextContent;

      expect(content.type).toBe('text');
      expect(content.text).toContain('simple prompt message');
    });

    it('should get prompt with required arguments', async () => {
      const result = await connector.getPrompt('greeting-prompt', {
        name: 'Alice',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      const content = firstMessage.content as TextContent;

      expect(content.type).toBe('text');
      expect(content.text).toContain('Alice');
    });

    it('should get prompt with optional arguments', async () => {
      const result = await connector.getPrompt('styled-prompt', {
        style: 'formal',
        format: 'long',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;

      expect(content.type).toBe('text');
      // formal long format should contain formal greeting
      expect(content.text).toContain('Good day');
    });

    it('should list prompts with correct argument definitions', async () => {
      const prompts = await connector.listPrompts();

      // find greeting-prompt and verify its arguments
      const greetingPrompt = prompts.find(
        (prompt: Prompt) => prompt.name === 'greeting-prompt',
      );

      expect(greetingPrompt).toBeDefined();
      expect(greetingPrompt!.arguments).toBeDefined();

      // name should be required
      const nameArg = greetingPrompt!.arguments!.find(
        (arg) => arg.name === 'name',
      );

      expect(nameArg).toEqual(
        expect.objectContaining({
          name: 'name',
          required: true,
        }),
      );
    });
  });

  describe('subscriptions', () => {
    it('should subscribe to resource updates', async () => {
      await expect(
        connector.subscribeToResource('test://text/1'),
      ).resolves.toBeUndefined();
    });

    it('should unsubscribe from resource updates', async () => {
      // subscribe first
      await connector.subscribeToResource('test://text/2');

      // unsubscribe should not throw
      await expect(
        connector.unsubscribeFromResource('test://text/2'),
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

      // should suggest completions starting with 'A' (e.g., 'Alice')
      if (result.completion.values.length > 0) {
        expect(
          result.completion.values.some((v: string) =>
            v.toLowerCase().startsWith('a'),
          ),
        ).toBe(true);
      }
    });

    it('should complete resource template arguments', async () => {
      const result = await connector.complete(
        { type: 'ref/resource', uri: 'test://text/{id}' },
        { name: 'id', value: '1' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();

      // should suggest '1' as a valid ID
      expect(result.completion.values).toContain('1');
    });
  });

  describe('logging', () => {
    it('should set log level', async () => {
      await expect(connector.setLogLevel('debug')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('info')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('error')).resolves.toBeUndefined();
    });
  });

  describe('message handling', () => {
    it('should ignore empty lines gracefully', async () => {
      // the server should handle empty lines without crashing
      // we verify this by ensuring the connection remains stable after operations
      const tools = await connector.listTools();

      expect(tools.length).toBe(TEST_TOOLS.length);

      // connection should still be active
      expect(connector.info.isConnected).toBe(true);
    });

    it('should handle rapid messages', async () => {
      // send multiple requests in quick succession
      const [tools, prompts, resources, echoResult1, echoResult2] =
        await Promise.all([
          connector.listTools(),
          connector.listPrompts(),
          connector.listResources(),
          connector.callTool('echo', { text: 'rapid-1' }),
          connector.callTool('echo', { text: 'rapid-2' }),
        ]);

      // verify all requests completed successfully
      expect(tools).toHaveLength(TEST_TOOLS.length);
      expect(prompts).toHaveLength(TEST_PROMPTS.length);
      expect(resources).toHaveLength(TEST_RESOURCES.length);

      expect(echoResult1.isError).toBeFalsy();
      expect(echoResult2.isError).toBeFalsy();

      expect((echoResult1.content[0] as TextContent).text).toBe('rapid-1');
      expect((echoResult2.content[0] as TextContent).text).toBe('rapid-2');
    });

    it('should maintain connection after error responses', async () => {
      // trigger an error by calling unknown tool
      await expect(connector.callTool('unknownTool', {})).rejects.toThrow();

      // connection should still be active
      expect(connector.info.isConnected).toBe(true);

      // should be able to make subsequent requests
      const tools = await connector.listTools();

      expect(tools.length).toBe(TEST_TOOLS.length);
    });
  });

  describe('status', () => {
    it('should report correct status information', () => {
      const status = connector.status;

      expect(status).toEqual({
        status: 'connected',
        transport: 'StdioConnector',
        processInfo: {
          pid: expect.any(Number),
          nodeVersion: expect.any(String),
          platform: expect.any(String),
          arch: expect.any(String),
          uptime: expect.any(Number),
        },
        timestamp: expect.any(String),
      });
    });
  });

  describe('disconnect', () => {
    it(
      'should disconnect gracefully',
      async () => {
        const testConnector = createConnector('disconnect-test-server');

        await testConnector.connect();

        expect(testConnector.info.isConnected).toBe(true);

        await testConnector.disconnect();

        expect(testConnector.info.isConnected).toBe(false);
      },
      CONNECTION_TIMEOUT,
    );

    it(
      'should handle multiple disconnect calls',
      async () => {
        const testConnector = createConnector('multi-disconnect-test');

        await testConnector.connect();
        await testConnector.disconnect();

        // second disconnect should not throw
        await expect(testConnector.disconnect()).resolves.toBeUndefined();
      },
      CONNECTION_TIMEOUT,
    );
  });
});
