/**
 * E2E tests for stdio client connector resource flows
 *
 * validates resources/list, resources/read (text and blob),
 * resources/templates/list, resources/subscribe, and resources/unsubscribe
 * using StdioConnector against server-everything over stdio.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientStdioContext } from '../fixtures/index';

import type {
  BlobResourceContents,
  TextResourceContents,
} from '@coremcp/protocol';

import type { ClientStdioContext } from '../fixtures/transport-helpers';

// TEST SUITE //

describe('client-connector-stdio / resources', () => {
  let ctx: ClientStdioContext;

  beforeAll(async () => {
    ctx = createClientStdioContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('resources/list', () => {
    it('should list resources with pagination [RESOURCE-001]', async () => {
      const resources = await ctx.connector.listResources();

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
  });

  describe('resources/read', () => {
    it('should read text resource (odd numbered) [RESOURCE-002]', async () => {
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
      const templates = await ctx.connector.listResourceTemplates();

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

  describe('resources/subscribe', () => {
    it('should subscribe to resource updates [RESOURCE-005]', async () => {
      await expect(
        ctx.connector.subscribeToResource('test://static/resource/1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('resources/unsubscribe', () => {
    it('should unsubscribe from resource updates [RESOURCE-006]', async () => {
      // subscribe first
      await ctx.connector.subscribeToResource('test://static/resource/2');

      // unsubscribe should not throw
      await expect(
        ctx.connector.unsubscribeFromResource('test://static/resource/2'),
      ).resolves.toBeUndefined();
    });
  });
});
