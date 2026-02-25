import { Ajv } from 'ajv';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerTool } from '#tool';

import type { Tool } from '@coremcp/protocol';

import type { SupportedVersion } from '#tool';

const compileFn = vi.fn();

vi.mock('ajv', () => {
  const AjvImpl = vi.fn(function (this: { compile: typeof compileFn }) {
    this.compile = compileFn;
  });

  return { Ajv: AjvImpl };
});

interface TestInput {
  input: string;
}

interface TestOutput {
  result: string;
}

describe('cl:ServerTool', () => {
  const createValidateFn = () => {
    const validateFn = vi.fn();
    compileFn.mockReturnValue(validateFn);

    return { validateFn, compileFn };
  };

  describe('constructor', () => {
    it('should create tool with minimal configuration', () => {
      const { compileFn: compile } = createValidateFn();
      const execute = vi.fn();
      const params = {
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute,
      };

      const tool = new ServerTool(params);

      expect(tool.name).toBe('test-tool');
      expect(tool.description).toBe('Test tool description');
      expect(tool.inputSchema).toEqual(params.inputSchema);
      expect(tool.title).toBeUndefined();
      expect(tool.outputSchema).toBeUndefined();
      expect(tool.annotations).toBeUndefined();
      expect(compile).toHaveBeenCalledWith(params.inputSchema);
    });

    it('should create tool with full configuration', () => {
      const execute = vi.fn();
      const params = {
        name: 'test-tool',
        title: 'Test Tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        outputSchema: {
          type: 'object' as const,
          properties: {
            output: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
        execute,
      };

      const tool = new ServerTool(params);

      expect(tool.name).toBe('test-tool');
      expect(tool.title).toBe('Test Tool');
      expect(tool.description).toBe('Test tool description');
      expect(tool.inputSchema).toEqual(params.inputSchema);
      expect(tool.outputSchema).toEqual(params.outputSchema);
      expect(tool.annotations).toEqual(params.annotations);
    });
  });

  describe('execute', () => {
    it('should execute tool with valid input', async () => {
      const { validateFn } = createValidateFn();
      const executeFn = vi.fn().mockResolvedValue({ result: 'test-result' });
      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: executeFn,
      });
      const input = { input: 'test-value' };
      const output = { result: 'test-result' };

      validateFn.mockReturnValue(true);

      const result = await tool.execute(input);

      expect(validateFn).toHaveBeenCalledWith(input);
      expect(executeFn).toHaveBeenCalledWith(input);
      expect(result).toEqual(output);
    });

    it('should throw error with invalid input', async () => {
      const { validateFn } = createValidateFn();
      const executeFn = vi.fn();
      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: executeFn,
      });
      const input = { input: 'invalid-input' };

      validateFn.mockReturnValue(false);

      await expect(tool.execute(input)).rejects.toThrow('Invalid input data');
      expect(executeFn).not.toHaveBeenCalled();
    });

    it('should propagate execution errors', async () => {
      const { validateFn: validate } = createValidateFn();
      const executionError = new Error('Execution failed');
      const executeFn2 = vi.fn().mockRejectedValue(executionError);
      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: executeFn2,
      });
      const input = { input: 'test-value' };

      validate.mockReturnValue(true);

      await expect(tool.execute(input)).rejects.toThrow(executionError);
    });
  });

  describe('toSpec', () => {
    let tool: ServerTool<TestInput, TestOutput>;

    beforeEach(() => {
      const params = {
        name: 'test-tool',
        title: 'Test Tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        outputSchema: {
          type: 'object' as const,
          properties: {
            output: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
        execute: vi.fn(),
      };

      tool = new ServerTool(params);
    });

    it('should return spec for version 2024-11-05', () => {
      const spec = tool.toSpec('2024-11-05');

      expect(spec).toEqual({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        },
      });
    });

    it('should return spec for version 2025-03-26', () => {
      const spec = tool.toSpec('2025-03-26');

      expect(spec).toEqual({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
      });
    });

    it('should return spec for version 2025-06-18', () => {
      const spec = tool.toSpec('2025-06-18');

      expect(spec).toEqual({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
        title: 'Test Tool',
        outputSchema: {
          type: 'object' as const,
          properties: {
            output: { type: 'string' as const },
          },
          required: [] as string[],
        },
      });
    });

    it('should return latest spec for unknown version', () => {
      const spec = tool.toSpec('unknown-version' as SupportedVersion);

      expect(spec).toEqual({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
        title: 'Test Tool',
        outputSchema: {
          type: 'object' as const,
          properties: {
            output: { type: 'string' as const },
          },
          required: [] as string[],
        },
      });
    });

    it('should handle missing optional fields', () => {
      const minimalTool = new ServerTool({
        name: 'minimal-tool',
        description: 'Minimal tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: vi.fn(),
      });

      const spec = minimalTool.toSpec('2025-06-18');

      expect(spec).toEqual({
        name: 'minimal-tool',
        description: 'Minimal tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: undefined,
        title: undefined,
        outputSchema: undefined,
      });
    });
  });

  describe('getters', () => {
    let tool: ServerTool<TestInput, TestOutput>;

    beforeEach(() => {
      const params = {
        name: 'test-tool',
        title: 'Test Tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        outputSchema: {
          type: 'object' as const,
          properties: {
            output: { type: 'string' as const },
          },
          required: [] as string[],
        },
        annotations: {
          title: 'Test Tool',
          readOnlyHint: false,
          destructiveHint: false,
        },
        execute: vi.fn(),
      };

      tool = new ServerTool(params);
    });

    it('should return name', () => {
      expect(tool.name).toBe('test-tool');
    });

    it('should return title', () => {
      expect(tool.title).toBe('Test Tool');
    });

    it('should return description', () => {
      expect(tool.description).toBe('Test tool description');
    });

    it('should return input schema', () => {
      expect(tool.inputSchema).toEqual({
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
        required: [],
      });
    });

    it('should return output schema', () => {
      expect(tool.outputSchema).toEqual({
        type: 'object',
        properties: {
          output: { type: 'string' },
        },
        required: [],
      });
    });

    it('should return annotations', () => {
      expect(tool.annotations).toEqual({
        title: 'Test Tool',
        readOnlyHint: false,
        destructiveHint: false,
      });
    });
  });

  describe('input validation', () => {
    it('should setup input validation with AJV', () => {
      const { compileFn: compile } = createValidateFn();
      const inputSchema = {
        type: 'object' as const,
        properties: {
          input: { type: 'string' as const },
        },
        required: [] as string[],
      } as Tool['inputSchema'];

      const params = {
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema,
        execute: vi.fn(),
      };

      const serverTool = new ServerTool(params);
      expect(serverTool).toBeDefined();

      expect(Ajv).toHaveBeenCalled();
      expect(compile).toHaveBeenCalledWith(inputSchema);
    });

    it('should validate input data correctly', async () => {
      const { validateFn } = createValidateFn();
      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: vi.fn().mockResolvedValue({}),
      });

      const validInput = { input: 'test' };
      const invalidInput = { invalid: 'data' };

      validateFn.mockReturnValue(true);
      await expect(tool.execute(validInput)).resolves.toBeDefined();

      validateFn.mockReturnValue(false);
      await expect(tool.execute(invalidInput)).rejects.toThrow(
        'Invalid input data',
      );
    });

    it('should format validation errors with instance path', async () => {
      const { validateFn } = createValidateFn();
      const input = { input: 123 };

      validateFn.mockReturnValue(false);
      (validateFn as any).errors = [
        {
          instancePath: '/input',
          message: 'must be string',
        },
      ];

      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: vi.fn().mockResolvedValue({ result: 'test' }),
      });

      await expect(tool.execute(input)).rejects.toThrow(
        'Invalid input data: /input: must be string',
      );
    });

    it('should format validation errors with root when instance path is null', async () => {
      const { validateFn } = createValidateFn();
      const input = { input: 123 };

      validateFn.mockReturnValue(false);
      (validateFn as any).errors = [
        {
          instancePath: null,
          message: 'invalid schema',
        },
      ];

      const tool = new ServerTool({
        name: 'test-tool',
        description: 'Test tool description',
        inputSchema: {
          type: 'object' as const,
          properties: {
            input: { type: 'string' as const },
          },
          required: [] as string[],
        } as Tool['inputSchema'],
        execute: vi.fn().mockResolvedValue({ result: 'test' }),
      });

      await expect(tool.execute(input)).rejects.toThrow(
        'Invalid input data: root: invalid schema',
      );
    });
  });
});
