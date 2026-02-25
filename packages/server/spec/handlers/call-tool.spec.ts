import { describe, expect, it } from 'vitest';

import { handleCallTool } from '#handlers/call-tool';

import {
  abort,
  basicCallToolParams,
  complexCallToolParams,
  customCallToolParams,
  emptyCallToolParams,
  legacySession,
  minimalSession,
  noArgsCallToolParams,
  session,
  sessionWithTools,
  sessionWithUser,
  specialCharsCallToolParams,
} from '../fixtures';

type CallToolParams = Parameters<typeof handleCallTool>[0];

describe('fn:handleCallTool', () => {
  describe('default implementation', () => {
    it('should throw error for any tool name', async () => {
      await expect(
        handleCallTool(basicCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: test-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should throw error with tool name in message', async () => {
      await expect(
        handleCallTool(customCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: my-custom-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool name with special characters', async () => {
      await expect(
        handleCallTool(specialCharsCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: tool-with-dashes_and_underscores. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle empty tool name', async () => {
      await expect(
        handleCallTool(emptyCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: . Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call without arguments', async () => {
      await expect(
        handleCallTool(noArgsCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: no-args-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with undefined arguments', async () => {
      const params: CallToolParams = {
        name: 'undefined-args-tool',
        arguments: undefined,
      };

      await expect(handleCallTool(params, { session, abort })).rejects.toThrow(
        "Tool not found: undefined-args-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with null arguments', async () => {
      const params = {
        name: 'null-args-tool',
        arguments: null,
      } as unknown as CallToolParams;

      await expect(handleCallTool(params, { session, abort })).rejects.toThrow(
        "Tool not found: null-args-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with empty arguments object', async () => {
      const params: CallToolParams = {
        name: 'empty-args-tool',
        arguments: {},
      };

      await expect(handleCallTool(params, { session, abort })).rejects.toThrow(
        "Tool not found: empty-args-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with complex arguments', async () => {
      await expect(
        handleCallTool(complexCallToolParams, { session, abort }),
      ).rejects.toThrow(
        "Tool not found: complex-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with different session types', async () => {
      const params: CallToolParams = {
        name: 'user-tool',
        arguments: { input: 'test' },
      };

      await expect(
        handleCallTool(params, { session: sessionWithUser, abort }),
      ).rejects.toThrow(
        "Tool not found: user-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with different protocol versions', async () => {
      const params: CallToolParams = {
        name: 'legacy-tool',
        arguments: { input: 'test' },
      };

      await expect(
        handleCallTool(params, { session: legacySession, abort }),
      ).rejects.toThrow(
        "Tool not found: legacy-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle tool call with session containing tools', async () => {
      const params: CallToolParams = {
        name: 'different-tool',
        arguments: { input: 'test' },
      };

      // default implementation doesn't check session tools
      await expect(
        handleCallTool(params, { session: sessionWithTools, abort }),
      ).rejects.toThrow(
        "Tool not found: different-tool. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should be consistent with error message format', async () => {
      const toolNames = ['tool1', 'tool2', 'tool3'];

      for (const toolName of toolNames) {
        const params: CallToolParams = {
          name: toolName,
          arguments: { input: 'test' },
        };

        await expect(
          handleCallTool(params, { session, abort }),
        ).rejects.toThrow(
          `Tool not found: ${toolName}. Please check the tool name and ensure it's registered with the server.`,
        );
      }
    });

    it('should throw Error instance', async () => {
      const params: CallToolParams = {
        name: 'test-tool',
        arguments: { input: 'test' },
      };

      try {
        await handleCallTool(params, { session, abort });
        // should not reach here
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toBe(
          "Tool not found: test-tool. Please check the tool name and ensure it's registered with the server.",
        );
      }
    });

    it('should handle unicode tool names', async () => {
      const params: CallToolParams = {
        name: 'test',
        arguments: { input: 'test' },
      };

      await expect(handleCallTool(params, { session, abort })).rejects.toThrow(
        "Tool not found: test. Please check the tool name and ensure it's registered with the server.",
      );
    });

    it('should handle very long tool names', async () => {
      const longToolName = 'a'.repeat(1000);
      const params: CallToolParams = {
        name: longToolName,
        arguments: { input: 'test' },
      };

      await expect(handleCallTool(params, { session, abort })).rejects.toThrow(
        `Tool not found: ${longToolName}. Please check the tool name and ensure it's registered with the server.`,
      );
    });

    describe('parameter validation', () => {
      it('should accept valid parameters', async () => {
        const params: CallToolParams = {
          name: 'valid-tool',
          arguments: { key: 'value' },
        };

        // the function should be called without type errors
        await expect(
          handleCallTool(params, { session, abort }),
        ).rejects.toThrow();
      });

      it('should accept parameters without arguments', async () => {
        const params: CallToolParams = {
          name: 'no-args-tool',
        };

        await expect(
          handleCallTool(params, { session, abort }),
        ).rejects.toThrow();
      });

      it('should work with minimal session object', async () => {
        const params: CallToolParams = {
          name: 'test-tool',
          arguments: { input: 'test' },
        };

        await expect(
          handleCallTool(params, { session: minimalSession, abort }),
        ).rejects.toThrow(
          "Tool not found: test-tool. Please check the tool name and ensure it's registered with the server.",
        );
      });
    });
  });
});
