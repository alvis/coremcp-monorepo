import { StdioConnector } from '@coremcp/client-stdio';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import type {
  BlobResourceContents,
  ImageContent,
  Prompt,
  TextContent,
  TextResourceContents,
  Tool,
} from '@coremcp/protocol';

// CONSTANTS //

/**
 * creates connector params for spawning server-everything
 * uses the locally installed package via node for faster startup
 * @param name
 * @param options
 * @param options.onNotification
 */
const createConnectorParams = (
  name: string,
  options?: {
    onNotification?: (notification: {
      method: string;
      params?: unknown;
    }) => Promise<void>;
  },
): {
  name: string;
  command: string;
  args: string[];
  clientInfo: { name: string; version: string };
  capabilities: { roots: { listChanged: true } };
  onNotification?: (notification: {
    method: string;
    params?: unknown;
  }) => Promise<void>;
} => ({
  name,
  command: 'npx',
  args: ['mcp-server-everything'],
  clientInfo: { name, version: '1.0.0' },
  capabilities: { roots: { listChanged: true } },
  ...options,
});

// TEST SUITES //

/**
 * E2E tests for StdioConnector against @modelcontextprotocol/server-everything
 *
 * server-everything provides:
 * - 11 tools including echo, add, getTinyImage, longRunningOperation
 * - 100 static resources at test://static/resource/{1-100}
 * - 3 prompts: simple_prompt, complex_prompt, resource_prompt
 *
 * these tests verify the full client lifecycle against a real server
 */
describe('StdioConnector E2E', () => {
  const connector = new StdioConnector(
    createConnectorParams('everything-server'),
  );

  beforeAll(async () => {
    await connector.connect();
  }, 30_000);

  afterAll(async () => {
    await connector.disconnect();
  });

  describe('connection', () => {
    it('should connect successfully', () => {
      expect(connector.info.isConnected).toBe(true);
    });

    it('should receive server info after connection', () => {
      expect(connector.info.serverInfo).toEqual({
        name: 'example-servers/everything',
        title: 'Everything Example Server',
        version: '1.0.0',
      });
    });

    it('should negotiate protocol version', () => {
      expect(connector.info.protocolVersion).toBeDefined();
      expect(typeof connector.info.protocolVersion).toBe('string');
    });

    it('should receive server capabilities', () => {
      const capabilities = connector.info.capabilities;

      expect(capabilities).toEqual(
        expect.objectContaining({
          tools: expect.any(Object),
          resources: expect.any(Object),
          prompts: expect.any(Object),
        }),
      );
    });

    it('should respond to ping', async () => {
      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('tools', () => {
    it('should list all 12 tools', async () => {
      // server-everything provides 11 base tools + listRoots (when roots capability is set)
      // startElicitation is only available when elicitation capability is set
      const tools = await connector.listTools();

      expect(tools.length).toBe(12);

      const toolNames = tools.map((tool: Tool) => tool.name);
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
    });

    it('should call echo tool and receive echoed message', async () => {
      const result = await connector.callTool('echo', { message: 'hello e2e' });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: 'Echo: hello e2e',
      });
    });

    it('should call add tool and return correct sum', async () => {
      const result = await connector.callTool('add', { a: 17, b: 25 });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent).toEqual({
        type: 'text',
        text: 'The sum of 17 and 25 is 42.',
      });
    });

    it('should call getTinyImage and return base64 PNG image', async () => {
      const result = await connector.callTool('getTinyImage', {});

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

    it('should call longRunningOperation and complete successfully', async () => {
      // note: progress notifications require progressToken in _meta which the
      // current callTool API doesn't support, so we only test completion
      const result = await connector.callTool('longRunningOperation', {
        duration: 1,
        steps: 3,
      });

      expect(result.isError).toBeFalsy();
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as TextContent;
      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe(
        'Long running operation completed. Duration: 1 seconds, Steps: 3.',
      );
    }, 30_000);

    it('should handle unknown tool error', async () => {
      // calling an unknown tool should throw a JSON-RPC error
      await expect(connector.callTool('nonExistentTool', {})).rejects.toThrow(
        'Unknown tool: nonExistentTool',
      );
    });
  });

  describe('resources', () => {
    it('should list resources with pagination', async () => {
      const resources = await connector.listResources();

      // server-everything provides 100 static resources
      expect(resources.length).toBe(100);

      // verify resource structure
      const firstResource = resources[0];
      expect(firstResource).toEqual(
        expect.objectContaining({
          uri: expect.stringMatching(/^test:\/\/static\/resource\/\d+$/),
          name: expect.any(String),
          mimeType: expect.any(String),
        }),
      );
    });

    it('should read text resource (odd numbered)', async () => {
      // odd numbered resources (1, 3, 5...) return text content
      const result = await connector.readResource('test://static/resource/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('test://static/resource/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toBe('Resource 1: This is a plaintext resource');
    });

    it('should read blob resource (even numbered)', async () => {
      // even numbered resources (2, 4, 6...) return blob content
      const result = await connector.readResource('test://static/resource/2');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as BlobResourceContents;
      expect(content.uri).toBe('test://static/resource/2');
      expect(content.mimeType).toBe('application/octet-stream');
      expect(content.blob).toBeDefined();

      // verify it's valid base64
      expect(() => atob(content.blob)).not.toThrow();
    });

    it('should list resource templates', async () => {
      const templates = await connector.listResourceTemplates();

      // server-everything provides resource templates
      expect(templates.length).toBeGreaterThanOrEqual(1);

      // verify template structure
      const template = templates[0];
      expect(template).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          uriTemplate: expect.any(String),
        }),
      );
    });
  });

  describe('prompts', () => {
    it('should list all 3 prompts', async () => {
      const prompts = await connector.listPrompts();

      expect(prompts.length).toBe(3);

      const promptNames = prompts.map((prompt: Prompt) => prompt.name);
      expect(promptNames).toEqual(
        expect.arrayContaining([
          'simple_prompt',
          'complex_prompt',
          'resource_prompt',
        ]),
      );
    });

    it('should get simple_prompt without arguments', async () => {
      const result = await connector.getPrompt('simple_prompt');

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');
      expect(firstMessage.content).toBeDefined();
    });

    it('should get complex_prompt with required temperature argument', async () => {
      const result = await connector.getPrompt('complex_prompt', {
        temperature: 'hot',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const firstMessage = result.messages[0];
      expect(firstMessage.role).toBe('user');

      // the prompt should include the temperature value
      const content = firstMessage.content as TextContent;
      if (content.type === 'text') {
        expect(content.text).toContain('hot');
      }
    });

    it('should get complex_prompt with optional style argument', async () => {
      const result = await connector.getPrompt('complex_prompt', {
        temperature: 'cold',
        style: 'formal',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);

      const content = result.messages[0].content as TextContent;
      if (content.type === 'text') {
        expect(content.text).toContain('cold');
        expect(content.text).toContain('formal');
      }
    });

    it('should get resource_prompt with resourceId argument', async () => {
      const result = await connector.getPrompt('resource_prompt', {
        resourceId: '50',
      });

      expect(result.messages).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('should list prompts with correct argument definitions', async () => {
      const prompts = await connector.listPrompts();

      // find complex_prompt and verify its arguments
      const complexPrompt = prompts.find(
        (prompt: Prompt) => prompt.name === 'complex_prompt',
      );
      expect(complexPrompt).toBeDefined();
      expect(complexPrompt!.arguments).toBeDefined();

      // temperature should be required
      const temperatureArg = complexPrompt!.arguments!.find(
        (arg) => arg.name === 'temperature',
      );
      expect(temperatureArg).toEqual(
        expect.objectContaining({
          name: 'temperature',
          required: true,
        }),
      );

      // style should be optional
      const styleArg = complexPrompt!.arguments!.find(
        (arg) => arg.name === 'style',
      );
      expect(styleArg).toEqual(
        expect.objectContaining({
          name: 'style',
        }),
      );
    });
  });

  describe('completion', () => {
    it('should complete prompt arguments', async () => {
      const result = await connector.complete(
        { type: 'ref/prompt', name: 'complex_prompt' },
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
      const templates = await connector.listResourceTemplates();

      if (templates.length > 0) {
        const template = templates[0];

        const result = await connector.complete(
          { type: 'ref/resource', uri: template.uriTemplate },
          { name: 'id', value: '1' },
        );

        expect(result.completion).toBeDefined();
        expect(result.completion.values).toBeDefined();
      }
    });
  });

  describe('logging', () => {
    it('should set log level', async () => {
      // should not throw
      await expect(connector.setLogLevel('debug')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('info')).resolves.toBeUndefined();
      await expect(connector.setLogLevel('error')).resolves.toBeUndefined();
    });
  });

  describe('resource subscriptions', () => {
    it('should subscribe to resource updates', async () => {
      // should not throw
      await expect(
        connector.subscribeToResource('test://static/resource/1'),
      ).resolves.toBeUndefined();
    });

    it('should unsubscribe from resource updates', async () => {
      // subscribe first
      await connector.subscribeToResource('test://static/resource/2');

      // unsubscribe should not throw
      await expect(
        connector.unsubscribeFromResource('test://static/resource/2'),
      ).resolves.toBeUndefined();
    });
  });

  describe('status', () => {
    it('should report correct status information', () => {
      const statusInfo = connector.status;

      expect(statusInfo).toEqual({
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
    it('should disconnect gracefully', async () => {
      // create a separate connector for disconnect test to not affect other tests
      const testConnector = new StdioConnector(
        createConnectorParams('disconnect-test-server'),
      );

      await testConnector.connect();

      expect(testConnector.info.isConnected).toBe(true);

      await testConnector.disconnect();

      expect(testConnector.info.isConnected).toBe(false);
    }, 30_000);

    it('should handle multiple disconnect calls', async () => {
      const testConnector = new StdioConnector(
        createConnectorParams('multi-disconnect-test'),
      );

      await testConnector.connect();
      await testConnector.disconnect();

      // second disconnect should not throw
      await expect(testConnector.disconnect()).resolves.toBeUndefined();
    }, 30_000);
  });
});
