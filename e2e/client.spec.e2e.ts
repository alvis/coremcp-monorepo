import { McpClient } from '@coremcp/client';
import { StdioConnector } from '@coremcp/client-stdio';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type {
  BlobResourceContents,
  ImageContent,
  TextContent,
  TextResourceContents,
} from '@coremcp/protocol';

import { CLIENT_INFO } from './fixtures/index';

// CONSTANTS //

const SERVER_NAME = 'everything-server';
const SECOND_SERVER_NAME = 'everything-server-2';

// HELPERS //

/**
 * creates a factory function for StdioConnector
 * @param name unique name for the server connection
 * @returns factory function compatible with McpClient.connect()
 */
const createStdioConnector = (name: string) => {
  return (params: {
    clientInfo: { name: string; version: string };
    capabilities: { roots?: { listChanged?: boolean } };
  }) =>
    new StdioConnector({
      ...params,
      name,
      command: 'npx',
      args: ['mcp-server-everything'],
    });
};

// TEST SUITES //

/**
 * E2E tests for McpClient with StdioConnector
 *
 * These tests verify the McpClient class which manages multiple server connections.
 * Uses @modelcontextprotocol/server-everything as the test server.
 *
 * server-everything provides:
 * - 12 tools including echo, add, getTinyImage, longRunningOperation (with roots capability)
 * - 100 static resources at test://static/resource/{1-100}
 * - 3 prompts: simple_prompt, complex_prompt, resource_prompt
 */
describe('e2e:McpClient with StdioConnector', () => {
  const client = new McpClient({
    name: CLIENT_INFO.name,
    version: CLIENT_INFO.version,
  });

  beforeAll(async () => {
    await client.connect(createStdioConnector(SERVER_NAME));
  }, 60_000);

  afterAll(async () => {
    await client.disconnectAll();
  });

  describe('connection', () => {
    it('should connect successfully and have server in list', () => {
      const servers = client.listServers();

      expect(Object.keys(servers)).toContain(SERVER_NAME);
    });

    it('should have server info after connection', () => {
      const server = client.getServer(SERVER_NAME);

      expect(server?.info.serverInfo).toEqual({
        name: 'example-servers/everything',
        title: 'Everything Example Server',
        version: '1.0.0',
      });
    });

    it('should report correct protocol version', () => {
      const server = client.getServer(SERVER_NAME);

      expect(server?.info.protocolVersion).toBeDefined();
      expect(typeof server?.info.protocolVersion).toBe('string');
    });

    it('should report server capabilities', () => {
      const server = client.getServer(SERVER_NAME);
      const capabilities = server?.info.capabilities;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });
  });

  describe('tools/list', () => {
    it('should list all available tools with server name', async () => {
      const tools = await client.listTools();

      expect(tools.length).toBe(12);

      const toolNames = tools.map((tool) => tool.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'echo',
          'add',
          'longRunningOperation',
          'printEnv',
          'sampleLLM',
          'getTinyImage',
          'annotatedMessage',
          'getResourceReference',
          'getResourceLinks',
          'structuredContent',
          'zip',
          'listRoots',
        ]),
      );

      // verify server name is attached
      expect(tools[0].serverName).toBe(SERVER_NAME);
    });

    it('should list tools from specific server', async () => {
      const tools = await client.listToolsFromServer(SERVER_NAME);

      expect(tools.length).toBe(12);

      // tools from specific server do not have serverName property
      const firstTool = tools[0];
      expect(firstTool.name).toBeDefined();
      expect(firstTool.description).toBeDefined();
    });
  });

  describe('tools/call', () => {
    it('should call echo tool and receive response', async () => {
      const result = await client.callTool(SERVER_NAME, 'echo', {
        message: 'hello e2e client',
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: 'Echo: hello e2e client',
      });
    });

    it('should call add tool with numeric arguments', async () => {
      const result = await client.callTool(SERVER_NAME, 'add', {
        a: 17,
        b: 25,
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: 'The sum of 17 and 25 is 42.',
      });
    });

    it('should call getTinyImage and return base64 PNG image', async () => {
      const result = await client.callTool(SERVER_NAME, 'getTinyImage', {});

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(3);

      // first content is text intro
      const textContent1 = result.content[0] as TextContent;
      expect(textContent1.type).toBe('text');
      expect(textContent1.text).toBe('This is a tiny image:');

      // second content is the image
      const imageContent = result.content[1] as ImageContent;
      expect(imageContent.type).toBe('image');
      expect(imageContent.mimeType).toBe('image/png');
      expect(imageContent.data).toBeDefined();

      // verify it's valid base64
      expect(() => atob(imageContent.data)).not.toThrow();

      // third content is text outro
      const textContent2 = result.content[2] as TextContent;
      expect(textContent2.type).toBe('text');
      expect(textContent2.text).toBe('The image above is the MCP tiny image.');
    });

    it('should throw error for nonexistent tool', async () => {
      await expect(
        client.callTool(SERVER_NAME, 'nonExistentTool', {}),
      ).rejects.toThrow('Unknown tool: nonExistentTool');
    });
  });

  describe('resources/list', () => {
    it('should list all resources with server name', async () => {
      const resources = await client.listResources();

      // server-everything provides 100 static resources
      expect(resources.length).toBe(100);

      // verify resource structure with server name
      const firstResource = resources[0];
      expect(firstResource).toEqual(
        expect.objectContaining({
          uri: expect.stringMatching(/^test:\/\/static\/resource\/\d+$/),
          name: expect.any(String),
          mimeType: expect.any(String),
          serverName: SERVER_NAME,
        }),
      );
    });

    it('should list resources from specific server', async () => {
      const resources = await client.listResourcesFromServer(SERVER_NAME);

      expect(resources.length).toBe(100);

      // resources from specific server do not have serverName property
      const firstResource = resources[0];
      expect(firstResource.uri).toBeDefined();
      expect(firstResource.name).toBeDefined();
    });
  });

  describe('resources/read', () => {
    it('should read text resource (odd numbered)', async () => {
      // odd numbered resources (1, 3, 5...) return text content
      const result = await client.readResource(
        SERVER_NAME,
        'test://static/resource/1',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('test://static/resource/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toBe('Resource 1: This is a plaintext resource');
    });

    it('should read blob resource (even numbered)', async () => {
      // even numbered resources (2, 4, 6...) return blob content
      const result = await client.readResource(
        SERVER_NAME,
        'test://static/resource/2',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as BlobResourceContents;
      expect(content.uri).toBe('test://static/resource/2');
      expect(content.mimeType).toBe('application/octet-stream');
      expect(content.blob).toBeDefined();

      // verify it's valid base64
      expect(() => atob(content.blob)).not.toThrow();
    });
  });

  describe('resources/templates', () => {
    it('should list resource templates with server name', async () => {
      const templates = await client.listResourceTemplates();

      // server-everything provides resource templates
      expect(templates.length).toBeGreaterThanOrEqual(1);

      // verify template structure with server name
      const template = templates[0];
      expect(template).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          uriTemplate: expect.any(String),
          serverName: SERVER_NAME,
        }),
      );
    });

    it('should list resource templates from specific server', async () => {
      const templates = await client.listResourceTemplatesFromServer(
        SERVER_NAME,
      );

      expect(templates.length).toBeGreaterThanOrEqual(1);

      // templates from specific server do not have serverName property
      const template = templates[0];
      expect(template.name).toBeDefined();
      expect(template.uriTemplate).toBeDefined();
    });
  });

  describe('prompts/list', () => {
    it('should list all prompts with server name', async () => {
      const prompts = await client.listPrompts();

      expect(prompts.length).toBe(3);

      const promptNames = prompts.map((prompt) => prompt.name);
      expect(promptNames).toEqual(
        expect.arrayContaining([
          'simple_prompt',
          'complex_prompt',
          'resource_prompt',
        ]),
      );

      // verify server name is attached
      expect(prompts[0].serverName).toBe(SERVER_NAME);
    });

    it('should find prompt by name', async () => {
      const prompt = await client.findPrompt('complex_prompt');

      expect(prompt).toBeDefined();
      expect(prompt?.name).toBe('complex_prompt');
      expect(prompt?.serverName).toBe(SERVER_NAME);
      expect(prompt?.arguments).toBeDefined();

      // temperature should be required
      const temperatureArg = prompt!.arguments!.find(
        (arg) => arg.name === 'temperature',
      );
      expect(temperatureArg).toEqual(
        expect.objectContaining({
          name: 'temperature',
          required: true,
        }),
      );
    });
  });

  describe('prompts/get', () => {
    it('should get simple_prompt without arguments via connector', async () => {
      const server = client.getServer(SERVER_NAME);
      const result = await server!.getPrompt('simple_prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();
    });

    it('should get complex_prompt with required arguments via connector', async () => {
      const server = client.getServer(SERVER_NAME);
      const result = await server!.getPrompt('complex_prompt', {
        temperature: 'hot',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');

      // the prompt should include the temperature value
      const content = firstMessage.content;
      if (content.type === 'text') {
        expect(content.text).toContain('hot');
      }
    });

    it('should get complex_prompt with optional style argument via connector', async () => {
      const server = client.getServer(SERVER_NAME);
      const result = await server!.getPrompt('complex_prompt', {
        temperature: 'cold',
        style: 'formal',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content;
      if (content.type === 'text') {
        expect(content.text).toContain('cold');
        expect(content.text).toContain('formal');
      }
    });
  });

  describe('completion', () => {
    it('should complete prompt arguments', async () => {
      const result = await client.completePrompt(
        SERVER_NAME,
        'complex_prompt',
        { name: 'temperature', value: 'h' },
      );

      expect(result.completion).toBeDefined();
      expect(result.completion.values).toBeDefined();

      // should suggest completions starting with 'h'
      if (result.completion.values.length > 0) {
        expect(
          result.completion.values.some((v: string) =>
            v.toLowerCase().startsWith('h'),
          ),
        ).toBe(true);
      }
    });

    it('should complete resource template arguments', async () => {
      const templates = await client.listResourceTemplates();

      if (templates.length > 0) {
        const template = templates[0];

        const result = await client.completeResourceTemplate(
          SERVER_NAME,
          template.uriTemplate,
          { name: 'id', value: '1' },
        );

        expect(result.completion).toBeDefined();
        expect(result.completion.values).toBeDefined();
      }
    });
  });

  describe('logging', () => {
    it('should set log level across servers', async () => {
      // should not throw
      await expect(client.setLogLevel('debug')).resolves.toBeUndefined();
      await expect(client.setLogLevel('info')).resolves.toBeUndefined();
      await expect(client.setLogLevel('error')).resolves.toBeUndefined();
    });
  });

  describe('disconnect', () => {
    it('should disconnect from specific server', async () => {
      // create a separate client for disconnect test
      const disconnectClient = new McpClient({
        name: CLIENT_INFO.name,
        version: CLIENT_INFO.version,
      });

      await disconnectClient.connect(
        createStdioConnector('disconnect-test-server'),
      );

      expect(Object.keys(disconnectClient.listServers())).toContain(
        'disconnect-test-server',
      );

      await disconnectClient.disconnect('disconnect-test-server');

      expect(Object.keys(disconnectClient.listServers())).not.toContain(
        'disconnect-test-server',
      );
    }, 30_000);

    it('should throw when disconnecting from nonexistent server', async () => {
      await expect(client.disconnect('nonexistent-server')).rejects.toThrow(
        'Cannot disconnect from nonexistent-server: server not found',
      );
    });
  });

  describe('multiple servers', () => {
    const multiClient = new McpClient({
      name: CLIENT_INFO.name,
      version: CLIENT_INFO.version,
    });

    beforeAll(async () => {
      await multiClient.connect(createStdioConnector(SERVER_NAME));
      await multiClient.connect(createStdioConnector(SECOND_SERVER_NAME));
    }, 120_000);

    afterAll(async () => {
      await multiClient.disconnectAll();
    });

    it('should connect to multiple servers', () => {
      const servers = multiClient.listServers();
      const serverNames = Object.keys(servers);

      expect(serverNames).toContain(SERVER_NAME);
      expect(serverNames).toContain(SECOND_SERVER_NAME);
      expect(serverNames.length).toBe(2);
    });

    it('should aggregate tools from all servers', async () => {
      const tools = await multiClient.listTools();

      // each server has 12 tools, total should be 24
      expect(tools.length).toBe(24);

      // verify tools from both servers are present
      const serverNames = [...new Set(tools.map((t) => t.serverName))];
      expect(serverNames).toContain(SERVER_NAME);
      expect(serverNames).toContain(SECOND_SERVER_NAME);
    });

    it('should list tools from specific server only', async () => {
      const tools = await multiClient.listToolsFromServer(SECOND_SERVER_NAME);

      expect(tools.length).toBe(12);
    });

    it('should call tool on specific server', async () => {
      const result = await multiClient.callTool(SECOND_SERVER_NAME, 'echo', {
        message: 'hello from second server',
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent.text).toBe('Echo: hello from second server');
    });

    it('should disconnect from specific server while keeping others', async () => {
      // create another client for this specific test
      const testClient = new McpClient({
        name: CLIENT_INFO.name,
        version: CLIENT_INFO.version,
      });

      await testClient.connect(createStdioConnector('multi-test-server-1'));
      await testClient.connect(createStdioConnector('multi-test-server-2'));

      await testClient.disconnect('multi-test-server-1');

      const servers = testClient.listServers();
      expect(Object.keys(servers)).not.toContain('multi-test-server-1');
      expect(Object.keys(servers)).toContain('multi-test-server-2');

      await testClient.disconnectAll();
    }, 60_000);

    it('should disconnect all servers with disconnectAll', async () => {
      // create another client for this specific test
      const testClient = new McpClient({
        name: CLIENT_INFO.name,
        version: CLIENT_INFO.version,
      });

      await testClient.connect(createStdioConnector('disconnect-all-server-1'));
      await testClient.connect(createStdioConnector('disconnect-all-server-2'));

      expect(Object.keys(testClient.listServers()).length).toBe(2);

      await testClient.disconnectAll();

      expect(Object.keys(testClient.listServers()).length).toBe(0);
    }, 60_000);
  });
});
