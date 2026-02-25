/**
 * provides a fully-featured MCP server with tools, prompts, resources
 *
 * resource templates, subscriptions, and completions for testing all MCP features.
 */

import type { Log } from '@coremcp/core';
import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from '@coremcp/protocol';
import type {
  CallTool,
  Complete,
  GetPrompt,
  ReadResource,
  Subscribe,
  Unsubscribe,
} from '@coremcp/server';

import { JsonRpcError, MCP_ERROR_CODES } from '@coremcp/protocol';

import { McpServer } from '@coremcp/server';

// EXPORTED CONSTANTS //

/** server application info for test assertions */
export const TEST_SERVER_INFO = {
  name: 'coremcp-test-server',
  version: '1.0.0',
};

/** list of tool names available in the test server */
export const TEST_TOOLS = ['echo', 'add', 'get-image', 'slow-operation'];

/** list of prompt names available in the test server */
export const TEST_PROMPTS = [
  'simple-prompt',
  'greeting-prompt',
  'styled-prompt',
];

/** list of resource URIs available in the test server */
export const TEST_RESOURCES = [
  'test://info',
  'test://text/1',
  'test://text/2',
  'test://text/3',
  'test://binary/1',
  'test://binary/2',
];

/** list of resource template URI patterns */
export const TEST_RESOURCE_TEMPLATES = [
  'test://text/{id}',
  'test://binary/{id}',
];

// INTERNAL CONSTANTS //

/** 1x1 red pixel PNG image encoded as base64 */
const RED_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

/** milliseconds per second for timeout calculations */
const MILLISECONDS_PER_SECOND = 1000;

// TOOL DEFINITIONS //

const tools: Tool[] = [
  {
    name: 'echo',
    description: 'Echoes back the provided text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to echo back',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
  {
    name: 'add',
    description: 'Adds two numbers together and returns the sum',
    inputSchema: {
      type: 'object',
      properties: {
        a: {
          type: 'number',
          description: 'First number to add',
        },
        b: {
          type: 'number',
          description: 'Second number to add',
        },
      },
      required: ['a', 'b'],
      additionalProperties: false,
    },
  },
  {
    name: 'get-image',
    description: 'Returns a small base64 PNG image for testing binary content',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'slow-operation',
    description:
      'Waits for specified duration then returns (for testing timeouts)',
    inputSchema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          description: 'Duration to wait in seconds',
        },
      },
      required: ['duration'],
      additionalProperties: false,
    },
  },
];

// PROMPT DEFINITIONS //

const prompts: Prompt[] = [
  {
    name: 'simple-prompt',
    description: 'A simple prompt with no arguments',
  },
  {
    name: 'greeting-prompt',
    description: 'Generates a greeting message for the specified name',
    arguments: [
      {
        name: 'name',
        description: 'Name of the person to greet',
        required: true,
      },
    ],
  },
  {
    name: 'styled-prompt',
    description: 'Generates a styled message with customizable format',
    arguments: [
      {
        name: 'style',
        description: 'Style of the message (formal, casual, friendly)',
        required: true,
      },
      {
        name: 'format',
        description: 'Optional format (short, long)',
        required: false,
      },
    ],
  },
];

// RESOURCE DEFINITIONS //

const resources: Resource[] = [
  {
    uri: 'test://info',
    name: 'Server Information',
    description: 'JSON metadata about the test server',
    mimeType: 'application/json',
  },
  {
    uri: 'test://text/1',
    name: 'Text Resource 1',
    description: 'Dynamic text resource for testing',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://text/2',
    name: 'Text Resource 2',
    description: 'Dynamic text resource for testing',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://text/3',
    name: 'Text Resource 3',
    description: 'Dynamic text resource for testing',
    mimeType: 'text/plain',
  },
  {
    uri: 'test://binary/1',
    name: 'Binary Resource 1',
    description: 'Dynamic binary resource for testing',
    mimeType: 'image/png',
  },
  {
    uri: 'test://binary/2',
    name: 'Binary Resource 2',
    description: 'Dynamic binary resource for testing',
    mimeType: 'image/png',
  },
];

// RESOURCE TEMPLATE DEFINITIONS //

const resourceTemplates: ResourceTemplate[] = [
  {
    name: 'Text Resources',
    description: 'Template for text resources with dynamic ID',
    uriTemplate: 'test://text/{id}',
    mimeType: 'text/plain',
  },
  {
    name: 'Binary Resources',
    description: 'Template for binary resources with dynamic ID',
    uriTemplate: 'test://binary/{id}',
    mimeType: 'image/png',
  },
];

// HANDLER IMPLEMENTATIONS //

/**
 * handles tool execution requests for the test server
 * @param params request parameters
 * @param params.name the tool name to execute
 * @param params.arguments tool-specific arguments
 * @returns tool execution result with content
 * @throws {Error} when the tool name is not recognized
 */
const callTool: CallTool = async ({ name, arguments: args }) => {
  switch (name) {
    case 'echo': {
      const text =
        args &&
        typeof args === 'object' &&
        'text' in args &&
        typeof (args as { text: unknown }).text === 'string'
          ? (args as { text: string }).text
          : '';

      return {
        content: [{ type: 'text', text }],
      };
    }

    case 'add': {
      const a =
        args &&
        typeof args === 'object' &&
        'a' in args &&
        typeof (args as { a: unknown }).a === 'number'
          ? (args as { a: number }).a
          : 0;

      const b =
        args &&
        typeof args === 'object' &&
        'b' in args &&
        typeof (args as { b: unknown }).b === 'number'
          ? (args as { b: number }).b
          : 0;

      const sum = a + b;

      return {
        content: [{ type: 'text', text: String(sum) }],
      };
    }

    case 'get-image': {
      return {
        content: [
          {
            type: 'image',
            data: RED_PIXEL_PNG_BASE64,
            mimeType: 'image/png',
          },
        ],
      };
    }

    case 'slow-operation': {
      const duration =
        args &&
        typeof args === 'object' &&
        'duration' in args &&
        typeof (args as { duration: unknown }).duration === 'number'
          ? (args as { duration: number }).duration
          : 1;

      const durationMs = duration * MILLISECONDS_PER_SECOND;

      await new Promise((resolve) => setTimeout(resolve, durationMs));

      return {
        content: [
          {
            type: 'text',
            text: `Operation completed after ${duration} second(s)`,
          },
        ],
      };
    }

    default:
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `Tool not found: ${name}. Available tools: ${TEST_TOOLS.join(
          ', ',
        )}`,
      });
  }
};

/**
 * handles prompt generation requests for the test server
 * @param params request parameters
 * @param params.name the prompt name to generate
 * @param params.arguments prompt-specific arguments
 * @returns generated prompt with messages
 * @throws {JsonRpcError} when the prompt name is not recognized
 */
const getPrompt: GetPrompt = async ({ name, arguments: args }) => {
  switch (name) {
    case 'simple-prompt': {
      return {
        description: 'A simple test message',
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: 'This is a simple prompt message for testing purposes.',
            },
          },
        ],
      };
    }

    case 'greeting-prompt': {
      const personName =
        args &&
        typeof args === 'object' &&
        'name' in args &&
        typeof (args as { name: unknown }).name === 'string'
          ? (args as { name: string }).name
          : 'World';

      return {
        description: `A greeting for ${personName}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Hello, ${personName}! Welcome to the test server.`,
            },
          },
        ],
      };
    }

    case 'styled-prompt': {
      const style =
        args &&
        typeof args === 'object' &&
        'style' in args &&
        typeof (args as { style: unknown }).style === 'string'
          ? (args as { style: string }).style
          : 'casual';

      const format =
        args &&
        typeof args === 'object' &&
        'format' in args &&
        typeof (args as { format: unknown }).format === 'string'
          ? (args as { format: string }).format
          : 'short';

      const isLongFormat = format === 'long';

      const messages: Record<string, string> = {
        formal: isLongFormat
          ? 'Good day. I trust this message finds you well. Please allow me to assist you with your inquiry.'
          : 'Good day. How may I assist you?',
        casual: isLongFormat
          ? 'Hey there! Hope you are doing great. Feel free to ask me anything you need help with.'
          : 'Hey! What can I help with?',
        friendly: isLongFormat
          ? 'Hi friend! It is wonderful to hear from you. I am here to help with whatever you need.'
          : 'Hi friend! How can I help?',
      };

      const messageText = messages[style] ?? messages.casual;

      return {
        description: `A ${style} message in ${format} format`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: messageText,
            },
          },
        ],
      };
    }

    default:
      throw new JsonRpcError({
        code: MCP_ERROR_CODES.INVALID_PARAMS,
        message: `Prompt not found: ${name}. Available prompts: ${TEST_PROMPTS.join(
          ', ',
        )}`,
      });
  }
};

/**
 * handles resource read requests for the test server
 * @param params request parameters
 * @param params.uri the resource URI to read
 * @param context request context
 * @param context.session the current session
 * @returns resource content with metadata
 * @throws {Error} when the resource URI is not recognized
 */
const readResource: ReadResource = async ({ uri }, { session }) => {
  // handle info resource
  if (uri === 'test://info') {
    return {
      contents: [
        {
          uri: 'test://info',
          mimeType: 'application/json',
          text: JSON.stringify(
            {
              name: TEST_SERVER_INFO.name,
              version: TEST_SERVER_INFO.version,
              description: 'A comprehensive test server for E2E testing',
              sessionId: session.id,
              tools: TEST_TOOLS,
              prompts: TEST_PROMPTS,
              resources: TEST_RESOURCES,
            },
            undefined,
            2,
          ),
        },
      ],
    };
  }

  // handle text resources
  const textMatch = /^test:\/\/text\/(\d+)$/.exec(uri);

  if (textMatch) {
    const id = textMatch[1];

    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Text content for resource ${id}. This is dynamic text resource number ${id}.`,
        },
      ],
    };
  }

  // handle binary resources
  const binaryMatch = /^test:\/\/binary\/(\d+)$/.exec(uri);

  if (binaryMatch) {
    return {
      contents: [
        {
          uri,
          mimeType: 'image/png',
          blob: RED_PIXEL_PNG_BASE64,
        },
      ],
    };
  }

  throw new JsonRpcError({
    code: MCP_ERROR_CODES.INVALID_PARAMS,
    message: `Resource not found: ${uri}`,
  });
};

/**
 * handles resource subscription requests
 * @param params request parameters containing resource URI
 * @param params.uri resource URI to subscribe to
 * @param context request context containing session and abort signal
 * @param context.session current session context
 * @returns empty acknowledgement response
 */
const subscribe: Subscribe = async ({ uri }, { session }) => {
  // the session already tracks subscriptions via session.subscribeResource
  // this handler provides a hook for additional subscription logic if needed
  session.subscribeResource(uri);

  return {};
};

/**
 * handles resource unsubscription requests
 * @param params request parameters containing resource URI
 * @param params.uri resource URI to unsubscribe from
 * @param context request context containing session and abort signal
 * @param context.session current session context
 * @returns empty acknowledgement response
 */
const unsubscribe: Unsubscribe = async ({ uri }, { session }) => {
  // the session already tracks subscriptions via session.unsubscribeResource
  // this handler provides a hook for additional unsubscription logic if needed
  session.unsubscribeResource(uri);

  return {};
};

/**
 * handles argument completion requests for prompts and resource templates
 * @param params request parameters for completion
 * @param params.ref reference to prompt or resource template
 * @param params.argument argument information for completion
 * @returns completion results with suggested values
 */
const complete: Complete = async ({ ref, argument }) => {
  // handle prompt argument completions
  if (ref.type === 'ref/prompt') {
    if (ref.name === 'greeting-prompt' && argument.name === 'name') {
      const suggestions = ['Alice', 'Bob', 'Charlie', 'David', 'Eve'];
      const filtered = suggestions.filter((s) =>
        s.toLowerCase().startsWith(argument.value.toLowerCase()),
      );

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }

    if (ref.name === 'styled-prompt') {
      if (argument.name === 'style') {
        const styles = ['formal', 'casual', 'friendly'];
        const filtered = styles.filter((s) =>
          s.toLowerCase().startsWith(argument.value.toLowerCase()),
        );

        return {
          completion: {
            values: filtered,
            total: filtered.length,
            hasMore: false,
          },
        };
      }

      if (argument.name === 'format') {
        const formats = ['short', 'long'];
        const filtered = formats.filter((f) =>
          f.toLowerCase().startsWith(argument.value.toLowerCase()),
        );

        return {
          completion: {
            values: filtered,
            total: filtered.length,
            hasMore: false,
          },
        };
      }
    }
  }

  // handle resource template URI completions
  if (ref.type === 'ref/resource') {
    if (ref.uri === 'test://text/{id}' && argument.name === 'id') {
      const ids = ['1', '2', '3'];
      const filtered = ids.filter((id) => id.startsWith(argument.value));

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }

    if (ref.uri === 'test://binary/{id}' && argument.name === 'id') {
      const ids = ['1', '2'];
      const filtered = ids.filter((id) => id.startsWith(argument.value));

      return {
        completion: {
          values: filtered,
          total: filtered.length,
          hasMore: false,
        },
      };
    }
  }

  // default: no completions available
  return {
    completion: {
      values: [],
      total: 0,
      hasMore: false,
    },
  };
};

// FACTORY FUNCTION //

/**
 * creates a comprehensive MCP server instance for E2E testing
 * @param log optional logger for server operations
 * @returns configured MCP server with tools, prompts, resources, and handlers
 */
export function createTestMcpServer(log?: Log): McpServer {
  return new McpServer({
    serverInfo: TEST_SERVER_INFO,
    log,
    instructions:
      'This is a comprehensive test server for E2E testing. It provides tools for basic operations, prompts for message generation, and resources for data retrieval.',
    tools,
    prompts,
    resources,
    resourceTemplates,
    handlers: {
      callTool,
      getPrompt,
      readResource,
      subscribe,
      unsubscribe,
      complete,
    },
  });
}
