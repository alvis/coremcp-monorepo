import { HttpMcpConnector } from '@coremcp/client-http';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
    CLIENT_INFO,
    HTTP_PORT,
    waitForServer,
    spawnHttpServer,
    killServer,
} from './fixtures/index';

import type { ChildProcess } from 'node:child_process';

// CONSTANTS //

const BASE_URL = `http://localhost:${HTTP_PORT}`;
const MCP_ENDPOINT = `${BASE_URL}/mcp`;

// HELPERS //

/**
 * creates a no-op token store for anonymous server connections
 */
function createNoOpTokenStore(): {
  getAccessToken: () => Promise<null>;
  getRefreshToken: () => Promise<null>;
  setTokens: () => Promise<void>;
  getTokenExpiration: () => Promise<null>;
  clearTokens: () => Promise<void>;
} {
  return {
    getAccessToken: async () => null,
    getRefreshToken: async () => null,
    setTokens: async () => {},
    getTokenExpiration: async () => null,
    clearTokens: async () => {},
  };
}

/**
 * creates HttpMcpConnector configured for server-everything
 */
function createConnector(): HttpMcpConnector {
  return new HttpMcpConnector({
    name: 'everything-server',
    url: MCP_ENDPOINT,
    clientInfo: CLIENT_INFO,
    capabilities: { roots: { listChanged: true } },
    oauth: {
      onAuth: async () => {
        throw new Error('OAuth not expected for anonymous server');
      },
      tokenStore: createNoOpTokenStore(),
      redirectUri: 'http://localhost:3100/callback',
    },
  });
}

// TEST SUITES //

describe('HttpMcpConnector E2E with server-everything', () => {
  let serverProcess: ChildProcess;
  let connector: HttpMcpConnector;

  beforeAll(async () => {
    serverProcess = spawnHttpServer();
    await waitForServer(MCP_ENDPOINT);

    connector = createConnector();
    await connector.connect();
  }, 60000);

  afterAll(async () => {
    await connector.disconnect();
    await killServer(serverProcess);
  });

  describe('connection', () => {
    it('should report connected status', () => {
      expect(connector.info.isConnected).toBe(true);
    });

    it('should have received server info', () => {
      const { serverInfo } = connector.info;

      expect(serverInfo).not.toBeNull();
      expect(serverInfo?.name).toBe('example-servers/everything');
    });

    it('should have negotiated protocol version', () => {
      const { protocolVersion } = connector.info;

      expect(protocolVersion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should have received server capabilities', () => {
      const { capabilities } = connector.info;

      expect(capabilities).not.toBeNull();
      expect(capabilities?.tools).toBeDefined();
      expect(capabilities?.prompts).toBeDefined();
      expect(capabilities?.resources).toBeDefined();
    });
  });

  describe('tools/list', () => {
    it('should list all available tools', async () => {
      const tools = await connector.listTools();

      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('echo');
      expect(toolNames).toContain('add');
      expect(toolNames).toContain('getTinyImage');
      expect(toolNames).toContain('longRunningOperation');
    });

    it('should include tool descriptions and input schemas', async () => {
      const tools = await connector.listTools();
      const echoTool = tools.find((t) => t.name === 'echo');

      expect(echoTool).toBeDefined();
      expect(echoTool?.description).toBeDefined();
      expect(echoTool?.inputSchema).toBeDefined();
      expect(echoTool?.inputSchema.type).toBe('object');
    });
  });

  describe('tools/call', () => {
    it('should call echo tool and receive response', async () => {
      const result = await connector.callTool('echo', { message: 'hello' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'Echo: hello',
      });
    });

    it('should call add tool with numeric arguments', async () => {
      const result = await connector.callTool('add', { a: 5, b: 3 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('8'),
      });
    });

    it('should call getTinyImage tool and receive image content', async () => {
      const result = await connector.callTool('getTinyImage', {});

      // server-everything returns 3 content items: text intro, image, text outro
      expect(result.content).toHaveLength(3);

      // find the image content in the array
      const imageContent = result.content.find(
        (c): c is { type: 'image'; mimeType: string; data: string } =>
          c.type === 'image',
      );
      expect(imageContent).toBeDefined();
      expect(imageContent).toMatchObject({
        type: 'image',
        mimeType: expect.stringMatching(/^image\//),
        data: expect.any(String),
      });
    });

    it('should handle longRunningOperation with progress', async () => {
      const result = await connector.callTool('longRunningOperation', {
        duration: 1,
        steps: 3,
      });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('completed'),
      });
    }, 15000);
  });

  describe('resources/list', () => {
    it('should list available resources', async () => {
      const resources = await connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should include resource URIs matching expected pattern', async () => {
      const resources = await connector.listResources();
      const resourceUris = resources.map((r) => r.uri);

      // server-everything provides test://static/resource/{1-100}
      const staticResources = resourceUris.filter((uri) =>
        uri.startsWith('test://static/resource/'),
      );
      expect(staticResources.length).toBeGreaterThan(0);
    });
  });

  describe('resources/read', () => {
    it('should read odd-numbered resource as text', async () => {
      const resources = await connector.listResources();
      const oddResource = resources.find((r) => {
        const match = /resource\/(\d+)$/.exec(r.uri);

        return match && Number(match[1]) % 2 === 1;
      });

      if (!oddResource) {
        throw new Error('No odd-numbered resource found');
      }

      const result = await connector.readResource(oddResource.uri);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: oddResource.uri,
        text: expect.any(String),
      });
    });

    it('should read even-numbered resource as blob', async () => {
      const resources = await connector.listResources();
      const evenResource = resources.find((r) => {
        const match = /resource\/(\d+)$/.exec(r.uri);

        return match && Number(match[1]) % 2 === 0;
      });

      if (!evenResource) {
        throw new Error('No even-numbered resource found');
      }

      const result = await connector.readResource(evenResource.uri);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: evenResource.uri,
        blob: expect.any(String),
      });
    });
  });

  describe('resources/templates/list', () => {
    it('should list resource templates', async () => {
      const templates = await connector.listResourceTemplates();

      expect(templates.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('prompts/list', () => {
    it('should list available prompts', async () => {
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p) => p.name);
      expect(promptNames).toContain('simple_prompt');
      expect(promptNames).toContain('complex_prompt');
    });

    it('should include prompt descriptions and arguments', async () => {
      const prompts = await connector.listPrompts();
      const complexPrompt = prompts.find((p) => p.name === 'complex_prompt');

      expect(complexPrompt).toBeDefined();
      expect(complexPrompt?.description).toBeDefined();
      expect(complexPrompt?.arguments).toBeDefined();
      expect(complexPrompt?.arguments?.length).toBeGreaterThan(0);
    });
  });

  describe('prompts/get', () => {
    it('should get simple prompt without arguments', async () => {
      const result = await connector.getPrompt('simple_prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should get complex prompt with temperature argument', async () => {
      const result = await connector.getPrompt('complex_prompt', {
        temperature: '0.7',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThan(0);
    });

    it('should get resource prompt with embedded resource', async () => {
      const prompts = await connector.listPrompts();
      const resourcePrompt = prompts.find((p) => p.name === 'resource_prompt');

      if (resourcePrompt) {
        const result = await connector.getPrompt('resource_prompt', {
          resourceId: '1',
        });

        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
      }
    });
  });

  describe('completion/complete', () => {
    it('should complete prompt argument', async () => {
      const prompts = await connector.listPrompts();
      const complexPrompt = prompts.find((p) => p.name === 'complex_prompt');

      if (complexPrompt?.arguments?.length) {
        const result = await connector.complete(
          { type: 'ref/prompt', name: 'complex_prompt' },
          { name: 'temperature', value: '0.' },
        );

        expect(result.completion).toBeDefined();
        expect(result.completion.values).toBeDefined();
      }
    });
  });

  describe('ping', () => {
    it('should respond to ping request', async () => {
      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('logging/setLevel', () => {
    it('should set log level to debug', async () => {
      await expect(connector.setLogLevel('debug')).resolves.toBeUndefined();
    });

    it('should set log level to error', async () => {
      await expect(connector.setLogLevel('error')).resolves.toBeUndefined();
    });
  });

  describe('concurrent requests', () => {
    it('should handle multiple concurrent tool calls', async () => {
      const requests = [
        connector.callTool('echo', { message: 'first' }),
        connector.callTool('echo', { message: 'second' }),
        connector.callTool('add', { a: 1, b: 2 }),
      ];

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      expect(results[0].content[0]).toMatchObject({
        type: 'text',
        text: 'Echo: first',
      });
      expect(results[1].content[0]).toMatchObject({
        type: 'text',
        text: 'Echo: second',
      });
      expect(results[2].content[0]).toMatchObject({
        type: 'text',
        text: expect.stringContaining('3'),
      });
    });

    it('should handle concurrent resource reads', async () => {
      const resources = await connector.listResources();
      const testResources = resources.slice(0, 3);

      const requests = testResources.map(async (r) =>
        connector.readResource(r.uri),
      );
      const results = await Promise.all(requests);

      expect(results).toHaveLength(testResources.length);
      results.forEach((result, index) => {
        expect(result.contents).toHaveLength(1);
        expect(result.contents[0].uri).toBe(testResources[index].uri);
      });
    });
  });

  describe('reconnection', () => {
    it('should disconnect and reconnect successfully', async () => {
      const freshConnector = createConnector();

      await freshConnector.connect();
      expect(freshConnector.info.isConnected).toBe(true);

      await freshConnector.disconnect();
      expect(freshConnector.info.isConnected).toBe(false);

      await freshConnector.connect();
      expect(freshConnector.info.isConnected).toBe(true);

      const tools = await freshConnector.listTools();
      expect(tools.length).toBeGreaterThan(0);

      await freshConnector.disconnect();
    });
  });

  describe('error handling', () => {
    it('should reject request when not connected', async () => {
      const disconnectedConnector = createConnector();

      await expect(disconnectedConnector.listTools()).rejects.toThrow(
        /not connected/i,
      );
    });

    it('should handle invalid tool call gracefully', async () => {
      await expect(
        connector.callTool('nonexistent_tool', {}),
      ).rejects.toThrow();
    });

    it('should handle invalid resource URI gracefully', async () => {
      await expect(
        connector.readResource('test://nonexistent/resource'),
      ).rejects.toThrow();
    });

    it('should handle invalid prompt name gracefully', async () => {
      await expect(connector.getPrompt('nonexistent_prompt')).rejects.toThrow();
    });
  });
});
