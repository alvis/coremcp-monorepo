/**
 * E2E tests for stdio transport resource flows
 *
 * validates resources/list, resources/read (text and binary),
 * resources/templates/list, resources/subscribe, resources/unsubscribe,
 * cursor-based pagination, subscribe cycle with updated notification,
 * and list_changed notification using our StdioConnector against the
 * coremcp test server over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerStdioClientContext } from '../fixtures/index';

import {
  TEST_RESOURCES,
  TEST_RESOURCE_TEMPLATES,
  TEST_SERVER_INFO,
} from '../fixtures/test-server';

import type { McpServerNotification } from '@coremcp/protocol';

import type { ServerStdioClientContext } from '../fixtures/transport-helpers';

// CONSTANTS //

/** 1x1 red pixel PNG image encoded as base64 - matches test server constant */
const RED_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

// TEST SUITE //

describe('server-transport-stdio / resources', () => {
  let ctx: ServerStdioClientContext;

  beforeAll(async () => {
    ctx = createServerStdioClientContext();
    await ctx.connector.connect();
  }, 30_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('resources/list', () => {
    it('should list all resources [RESOURCE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/list returns all registered resources with their URIs.
       * Per spec, clients send a resources/list request to discover available resources;
       * the server responds with a list of Resource objects each containing a uri field.
       * The test correctly checks that all expected test resource URIs are present.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#listing-resources
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L451-L477 (resources/list handler returns uri, name, and metadata)
       */
      const resources = await ctx.connector.listResources();

      expect(resources).toBeDefined();
      expect(Array.isArray(resources)).toBe(true);
      expect(resources.length).toBe(TEST_RESOURCES.length);

      const uris = resources.map((r) => r.uri);
      expect(uris).toEqual(expect.arrayContaining(TEST_RESOURCES));
    });
  });

  describe('resources/read', () => {
    it('should read text resource [RESOURCE-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/read returns text content with uri, mimeType, and text fields.
       * Per spec, text resources return contents array where each item has uri, mimeType, and text.
       * The test correctly checks all three fields plus the content value.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#reading-resources
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#text-content
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L489-L520 (resources/read handler resolves resource and returns contents)
       */
      const result = await ctx.connector.readResource('test://text/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('test://text/1');
      expect(content.mimeType).toBe('text/plain');
      expect('text' in content && content.text).toContain(
        'Text content for resource 1',
      );
    });

    it('should read binary resource [RESOURCE-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/read returns binary content as base64-encoded blob.
       * Per spec, binary resources use the blob field with base64-encoded data and appropriate mimeType.
       * The test correctly validates uri, mimeType (image/png), exact blob content, and valid base64.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#binary-content
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L489-L520 (resources/read handler resolves resource and returns contents)
       */
      const result = await ctx.connector.readResource('test://binary/1');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('test://binary/1');
      expect(content.mimeType).toBe('image/png');
      expect('blob' in content ? content.blob : undefined).toBe(
        RED_PIXEL_PNG_BASE64,
      );

      // verify it's valid base64
      if ('blob' in content) {
        expect(() => atob(content.blob)).not.toThrow();
      }
    });

    it('should read JSON resource [RESOURCE-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/read returns JSON content as text with application/json mimeType.
       * Per spec, text resources return contents with uri, mimeType, and text fields;
       * JSON is transmitted as text content with the appropriate MIME type. The test correctly
       * validates parseable JSON in the text field and checks expected server info values.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#text-content
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L489-L520 (resources/read handler resolves resource and returns contents)
       */
      const result = await ctx.connector.readResource('test://info');

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('test://info');
      expect(content.mimeType).toBe('application/json');
      expect('text' in content && content.text).toBeDefined();

      // verify it's valid JSON with expected server info
      if ('text' in content) {
        const jsonParsed = JSON.parse(content.text) as Record<string, unknown>;
        expect(jsonParsed.name).toBe(TEST_SERVER_INFO.name);
        expect(jsonParsed.version).toBe(TEST_SERVER_INFO.version);
      }
    });
  });

  describe('resources/templates/list', () => {
    it('should list resource templates [RESOURCE-004]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/templates/list returns registered resource templates with uriTemplate fields.
       * Per spec, servers can expose parameterized resources via URI templates (RFC 6570).
       * The response contains resourceTemplates array with uriTemplate, name, and optional metadata.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#resource-templates
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L479-L487 (resources/templates/list handler returns name, uriTemplate, and metadata)
       */
      const templates = await ctx.connector.listResourceTemplates();

      expect(templates).toBeDefined();
      expect(templates.length).toBe(TEST_RESOURCE_TEMPLATES.length);

      const templateUris = templates.map((t) => t.uriTemplate);
      expect(templateUris).toEqual(
        expect.arrayContaining(TEST_RESOURCE_TEMPLATES),
      );
    });
  });

  describe('resources/subscribe', () => {
    it('should subscribe to resource updates [RESOURCE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/subscribe succeeds (resolves without error).
       * Per spec, clients can subscribe to specific resources via resources/subscribe
       * with a uri param; server responds with empty result ({}) on success.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#subscriptions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1065-L1068 (SubscribeRequestSchema definition)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L2661 (resources/subscribe returns EmptyResult)
       */
      await expect(
        ctx.connector.subscribeToResource('test://text/1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resources/unsubscribe', () => {
    it('should unsubscribe from resource updates [RESOURCE-006]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that resources/unsubscribe succeeds after a prior subscription.
       * Per spec, clients can unsubscribe from previously subscribed resources;
       * the server responds with empty result ({}) on success.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#subscriptions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1074-L1077 (UnsubscribeRequestSchema definition)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L2662 (resources/unsubscribe returns EmptyResult)
       */
      // subscribe first
      await ctx.connector.subscribeToResource('test://text/2');

      await expect(
        ctx.connector.unsubscribeFromResource('test://text/2'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resources/list pagination', () => {
    it('should paginate resources with cursor-based navigation [RESOURCE-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies cursor-based pagination for resources/list.
       * Per spec, resources/list supports pagination via optional cursor param
       * and returns nextCursor when more results are available. The test correctly
       * validates non-overlapping pages and the presence of nextCursor.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#listing-resources
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/mcp.ts#L451-L477 (resources/list handler)
       */
      // first page without cursor returns up to PAGE_SIZE=3 items
      const firstPage = await ctx.connector.sendRequest<{
        resources: Array<{ uri: string; name: string; mimeType?: string }>;
        nextCursor?: string;
      }>({ method: 'resources/list', params: {} });

      expect(firstPage.resources.length).toBeGreaterThan(0);
      expect(firstPage.resources.length).toBeLessThanOrEqual(3);
      expect(firstPage.nextCursor).toBeDefined();

      // second page uses the opaque cursor from the first page
      const secondPage = await ctx.connector.sendRequest<{
        resources: Array<{ uri: string; name: string; mimeType?: string }>;
        nextCursor?: string;
      }>({ method: 'resources/list', params: { cursor: firstPage.nextCursor } });

      expect(secondPage.resources.length).toBeGreaterThan(0);

      // pages must not overlap
      const firstUris = new Set(firstPage.resources.map((r) => r.uri));
      expect(secondPage.resources.every((r) => !firstUris.has(r.uri))).toBe(true);
    });
  });

  describe('resources/subscribe cycle', () => {
    it('should receive updated notification after subscribing and triggering change [RESOURCE-005]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies the full subscribe-update-notify cycle: subscribe to a resource,
       * trigger an update, and receive a notifications/resources/updated notification
       * containing the subscribed URI, then re-read the resource.
       * Per spec, when a subscribed resource changes, the server sends
       * notifications/resources/updated with the resource URI.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#subscriptions
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L660-L665 (sendResourceUpdated sends notifications/resources/updated)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1090-L1094 (ResourceUpdatedNotificationSchema)
       */
      const notifications: McpServerNotification[] = [];

      // create a dedicated context with onNotification handler
      const notifyCtx = createServerStdioClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        // subscribe to the resource
        await notifyCtx.connector.subscribeToResource('test://text/1');

        // trigger a resource updated notification via the trigger tool
        await notifyCtx.connector.callTool('trigger-resource-updated', {
          uri: 'test://text/1',
        });

        // allow time for the notification to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        // verify we received the resource updated notification
        const updatedNotifications = notifications.filter(
          (n) => n.method === 'notifications/resources/updated',
        );
        expect(updatedNotifications.length).toBeGreaterThanOrEqual(1);

        // verify the notification references the correct subscribed URI
        const params = updatedNotifications[0].params as { uri: string };
        expect(params.uri).toBe('test://text/1');

        // re-read the resource to verify it is still readable after the cycle
        const result =
          await notifyCtx.connector.readResource('test://text/1');
        expect(result.contents).toHaveLength(1);
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });

  describe('resources/list_changed notification', () => {
    it('should receive list_changed notification when triggered [RESOURCE-007]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * Verifies that the server sends notifications/resources/list_changed when
       * the list of available resources changes.
       * Per spec, servers that declare capabilities.resources.listChanged emit this notification
       * with no params. The test correctly verifies the notification is received after triggering.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/resources#list-changed-notification
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L667-L671 (sendResourceListChanged sends notifications/resources/list_changed)
       */
      const notifications: McpServerNotification[] = [];

      const notifyCtx = createServerStdioClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        // trigger a resources list_changed notification
        await notifyCtx.connector.callTool('trigger-list-changed', {
          target: 'resources',
        });

        // allow time for the notification to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const listChangedNotifications = notifications.filter(
          (n) => n.method === 'notifications/resources/list_changed',
        );
        expect(listChangedNotifications.length).toBeGreaterThanOrEqual(1);
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });
});
