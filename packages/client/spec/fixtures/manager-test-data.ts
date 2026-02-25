/**
 * @file consolidated manager test data
 * @module spec/fixtures/manager-test-data
 * @description
 * shared test data for manager classes (PromptManager, ToolManager, ResourceManager)
 * including prompts, tools, resources, and resource templates for multiple test servers.
 * consolidates duplicate test data from prompt.spec.ts, tool.spec.ts, and resource.spec.ts
 */

import type {
  Prompt,
  Resource,
  ResourceTemplate,
  Tool,
} from '@coremcp/protocol';

// PROMPT TEST DATA //

export const testPrompts1: Prompt[] = [
  {
    name: 'server1-prompt1',
    description: 'First prompt from server 1',
    arguments: [
      { name: 'arg1', description: 'First argument', required: true },
    ],
  },
  {
    name: 'server1-prompt2',
    description: 'Second prompt from server 1',
    arguments: [],
  },
];

export const testPrompts2: Prompt[] = [
  {
    name: 'server2-prompt1',
    description: 'First prompt from server 2',
    arguments: [{ name: 'arg1', description: 'Argument', required: false }],
  },
];

// TOOL TEST DATA //

export const testTools1: Tool[] = [
  {
    name: 'server1-tool1',
    description: 'First tool from server 1',
    inputSchema: {
      type: 'object',
      properties: {
        arg1: { type: 'string', description: 'First argument' },
      },
      required: ['arg1'],
    } as Tool['inputSchema'],
  },
  {
    name: 'server1-tool2',
    description: 'Second tool from server 1',
    inputSchema: {
      type: 'object',
      properties: {
        arg1: { type: 'number', description: 'Number argument' },
        arg2: { type: 'boolean', description: 'Boolean argument' },
      },
      required: [],
    } as Tool['inputSchema'],
  },
];

export const testTools2: Tool[] = [
  {
    name: 'server2-tool1',
    description: 'First tool from server 2',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Input text' },
      },
      required: ['input'],
    } as Tool['inputSchema'],
  },
];

// RESOURCE TEST DATA //

export const testResources1: Resource[] = [
  {
    uri: 'file:///server1/file1.txt',
    name: 'file1.txt',
    description: 'First file from server 1',
    mimeType: 'text/plain',
  },
  {
    uri: 'file:///server1/file2.json',
    name: 'file2.json',
    description: 'Second file from server 1',
    mimeType: 'application/json',
  },
];

export const testResources2: Resource[] = [
  {
    uri: 'https://server2/api/data',
    name: 'API Data',
    description: 'Data from server 2 API',
    mimeType: 'application/json',
  },
];

// RESOURCE TEMPLATE TEST DATA //

export const testTemplates1: ResourceTemplate[] = [
  {
    uriTemplate: 'file:///server1/{path}',
    name: 'File Template',
    description: 'Template for files on server 1',
    mimeType: 'text/plain',
  },
];

export const testTemplates2: ResourceTemplate[] = [
  {
    uriTemplate: 'https://server2/api/{endpoint}',
    name: 'API Template',
    description: 'Template for API endpoints on server 2',
    mimeType: 'application/json',
  },
];
