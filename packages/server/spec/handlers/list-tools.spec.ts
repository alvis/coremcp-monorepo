import { describe, expect, it } from 'vitest';

import { handleListTools } from '#handlers/list-tools';

import {
  abort,
  session,
  sessionWithCommonTools,
  sessionWithSingleTool,
} from '../fixtures';

type Params = Parameters<typeof handleListTools>[0];
type Context = Parameters<typeof handleListTools>[1];

describe('fn:handleListTools', () => {
  describe('default implementation', () => {
    it('should return empty tools list when session has no tools', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result).toEqual({
        tools: [],
      });
    });

    it('should return tools from session', async () => {
      const params: Params = {};

      const context: Context = {
        session: sessionWithCommonTools,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result).toEqual({
        tools: sessionWithCommonTools.tools,
      });
    });

    it('should handle request without cursor', async () => {
      const params: Params = {};

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result).toEqual({
        tools: [],
      });
    });

    it('should handle cursor parameter for pagination', async () => {
      const cursors = ['cursor1', 'cursor2', undefined];

      for (const cursor of cursors) {
        const params: Params = {
          cursor,
        };

        const context: Context = {
          session: sessionWithSingleTool,
          abort,
        };

        const result = await handleListTools(params, context);
        // when cursor doesn't match any tool name, should return empty array
        // when cursor is undefined, should return all tools
        if (cursor === undefined) {
          expect(result.tools).toEqual(sessionWithSingleTool.tools);
        } else {
          expect(result.tools).toEqual([]);
        }
      }
    });
  });

  describe('response structure validation', () => {
    it('should always return an object with tools array', async () => {
      const params: Params = {
        cursor: 'test-cursor',
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result).toHaveProperty('tools');
      expect(Array.isArray(result.tools)).toBe(true);
    });

    it('should return tools from session when available', async () => {
      const params: Params = {};

      const context: Context = {
        session: sessionWithSingleTool,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result.tools).toEqual(sessionWithSingleTool.tools);
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0]).toHaveProperty('name');
      expect(result.tools[0]).toHaveProperty('description');
      expect(result.tools[0]).toHaveProperty('inputSchema');
    });

    it('should handle sessions with multiple tools', async () => {
      const params: Params = {};

      const context: Context = {
        session: sessionWithCommonTools,
        abort,
      };

      const result = await handleListTools(params, context);

      expect(result.tools).toHaveLength(2);
      expect(result.tools[0].name).toBe('echo');
      expect(result.tools[1].name).toBe('calculator');
    });

    it('should handle cursor that exists in tools list', async () => {
      const params: Params = {
        cursor: 'echo', // this tool exists in sessionWithCommonTools
      };

      const context: Context = {
        session: sessionWithCommonTools,
        abort,
      };

      const result = await handleListTools(params, context);

      // should return tools after the cursor (only 'calculator' comes after 'echo')
      expect(result.tools).toHaveLength(1);
      expect(result.tools[0].name).toBe('calculator');
    });

    it('should handle cursor that does not exist in tools list', async () => {
      const params: Params = {
        cursor: 'nonexistent',
      };

      const context: Context = {
        session: sessionWithCommonTools,
        abort,
      };

      const result = await handleListTools(params, context);

      // should return empty array when cursor not found
      expect(result).toEqual({
        tools: [],
      });
    });
  });
});
