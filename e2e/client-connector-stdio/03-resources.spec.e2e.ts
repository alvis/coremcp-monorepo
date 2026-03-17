/**
 * E2E tests for stdio client connector resource flows
 *
 * validates resources/list, resources/read (text and blob),
 * resources/templates/list, resources/subscribe, and resources/unsubscribe
 * using StdioConnector against the coremcp test server over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';
import { TEST_RESOURCES, TEST_RESOURCE_TEMPLATES } from '../fixtures/test-server';

import type {
  BlobResourceContents,
  TextResourceContents,
} from '@coremcp/protocol';

import type { ServerStdioClientContext } from '../fixtures/transport-helpers';

// TEST SUITE //

describe('client-connector-stdio / resources', () => {
  const ctx: ServerStdioClientContext = createServerStdioClientContext();

  beforeAll(async () => {
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('resources/list', () => {
    it('should list resources with pagination [RESOURCE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/list returns the expected static resources.
       * per spec, clients use resources/list to discover available resources.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#listing-resources
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (resources/list handler)
       */
      const resources = await ctx.connector.listResources();

      // coremcp test server provides static resources
      expect(resources.length).toBe(TEST_RESOURCES.length);

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
  });

  describe('resources/read', () => {
    it('should read text resource (odd numbered) [RESOURCE-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/read returns text content for odd-numbered resources.
       * per spec, text resources use a text field with an appropriate mimeType.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#reading-resources
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#text-content
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (resources/read handler)
       */
      // odd numbered resources (1, 3, 5...) return text content
      const result = await ctx.connector.readResource(
        'test://static/resource/1',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('test://static/resource/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toBe('Resource 1: This is a plaintext resource');
    });

    it('should read blob resource (even numbered) [RESOURCE-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/read returns blob content for even-numbered resources.
       * per spec, binary resource contents use a base64-encoded blob field.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#binary-content
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (resources/read handler)
       */
      // even numbered resources (2, 4, 6...) return blob content
      const result = await ctx.connector.readResource(
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

  describe('resources/templates/list', () => {
    it('should list resource templates [RESOURCE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/templates/list returns the registered templates.
       * per spec, servers can expose parameterized resources via templates.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#resource-templates
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts (resources/templates/list handler)
       */
      const templates = await ctx.connector.listResourceTemplates();

      // coremcp test server provides resource templates
      expect(templates.length).toBe(TEST_RESOURCE_TEMPLATES.length);

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

  describe('resources/subscribe', () => {
    it('should subscribe to resource updates [RESOURCE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/subscribe succeeds for a supported resource URI.
       * per spec, subscriptions are an MCP resource utility with empty-result success.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#subscriptions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1065-L1068 (SubscribeRequestSchema)
       */
      await expect(
        ctx.connector.subscribeToResource('test://static/resource/1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resources/unsubscribe', () => {
    it('should unsubscribe from resource updates [RESOURCE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies resources/unsubscribe succeeds after an active subscription.
       * per spec, clients can cancel a prior resource subscription cleanly.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#subscriptions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1074-L1077 (UnsubscribeRequestSchema)
       */
      // subscribe first
      await ctx.connector.subscribeToResource('test://static/resource/2');

      // unsubscribe should not throw
      await expect(
        ctx.connector.unsubscribeFromResource('test://static/resource/2'),
      ).resolves.toBeUndefined();
    });
  });
});
