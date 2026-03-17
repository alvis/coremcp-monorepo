/**
 * E2E tests for HTTP client connector resource flows
 *
 * validates resources/list, resources/read (text and blob),
 * resources/templates/list, resources/subscribe, and resources/unsubscribe
 * using HttpMcpConnector against server-everything over HTTP.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createClientHttpContext } from '../fixtures/index';

import type {
  BlobResourceContents,
  TextResourceContents,
} from '@coremcp/protocol';

import type { ClientHttpContext } from '../fixtures/index';

// TEST SUITE //

describe('client-connector-http / resources', () => {
  let ctx: ClientHttpContext;

  beforeAll(async () => {
    ctx = await createClientHttpContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  describe('resources/list', () => {
    it('should list available resources [RESOURCE-001]', async () => {
      const resources = await ctx.connector.listResources();

      expect(resources.length).toBeGreaterThan(0);
    });

    it('should include resource URIs matching expected pattern [RESOURCE-001]', async () => {
      const resources = await ctx.connector.listResources();
      const resourceUris = resources.map((r) => r.uri);

      // server-everything provides test://static/resource/{1-100}
      const staticResources = resourceUris.filter((uri) =>
        uri.startsWith('test://static/resource/'),
      );
      expect(staticResources.length).toBeGreaterThan(0);
    });
  });

  describe('resources/read', () => {
    it('should read odd-numbered resource as text [RESOURCE-002]', async () => {
      const resources = await ctx.connector.listResources();
      const oddResource = resources.find((r) => {
        const match = /resource\/(\d+)$/.exec(r.uri);

        return match && Number(match[1]) % 2 === 1;
      });

      if (!oddResource) {
        throw new Error('No odd-numbered resource found');
      }

      const result = await ctx.connector.readResource(oddResource.uri);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: oddResource.uri,
        text: expect.any(String),
      });
    });

    it('should read even-numbered resource as blob [RESOURCE-003]', async () => {
      const resources = await ctx.connector.listResources();
      const evenResource = resources.find((r) => {
        const match = /resource\/(\d+)$/.exec(r.uri);

        return match && Number(match[1]) % 2 === 0;
      });

      if (!evenResource) {
        throw new Error('No even-numbered resource found');
      }

      const result = await ctx.connector.readResource(evenResource.uri);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toMatchObject({
        uri: evenResource.uri,
        blob: expect.any(String),
      });
    });

    it('should read text resource with correct content [RESOURCE-002]', async () => {
      const result = await ctx.connector.readResource(
        'test://static/resource/1',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('test://static/resource/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toBe('Resource 1: This is a plaintext resource');
    });

    it('should read blob resource with valid base64 [RESOURCE-003]', async () => {
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

      expect(templates.length).toBeGreaterThanOrEqual(0);
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
