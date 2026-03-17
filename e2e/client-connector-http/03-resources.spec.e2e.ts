/**
 * E2E tests for HTTP client connector resource flows
 *
 * validates resources/list, resources/read (text and blob),
 * resources/templates/list, resources/subscribe, and resources/unsubscribe
 * using HttpMcpConnector against server-everything over HTTP.
 */

import { describe, expect } from 'vitest';

import { clientHttpTest } from '../fixtures/http-test-fixtures';

import type { TextResourceContents } from '@coremcp/protocol';

// TEST SUITE //

describe('client-connector-http / resources', () => {
  describe('resources/list', () => {
    clientHttpTest('should list resources [RESOURCE-001]', async ({ connector }) => {
      const resources = await connector.listResources();

      // server-everything provides static doc file resources
      expect(resources.length).toBeGreaterThan(0);

      // verify resource structure
      const firstResource = resources[0];
      expect(firstResource).toEqual(
        expect.objectContaining({
          uri: expect.any(String),
          name: expect.any(String),
        }),
      );
    });
  });

  describe('resources/read', () => {
    clientHttpTest('should read a static document resource [RESOURCE-002]', async ({ connector }) => {
      const resources = await connector.listResources();
      expect(resources.length).toBeGreaterThan(0);

      // read the first available resource
      const firstUri = resources[0].uri;
      const result = await connector.readResource(firstUri);

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe(firstUri);
      expect(content.text).toBeDefined();
    });
  });

  describe('resources/templates/list', () => {
    clientHttpTest('should list resource templates [RESOURCE-004]', async ({ connector }) => {
      const templates = await connector.listResourceTemplates();

      // server-everything provides dynamic text and blob resource templates
      expect(templates.length).toBe(2);

      // verify template structure
      const template = templates[0];
      expect(template).toEqual(
        expect.objectContaining({
          name: expect.any(String),
          uriTemplate: expect.any(String),
        }),
      );

      // verify both dynamic resource templates are present
      const uriTemplates = templates.map((t) => t.uriTemplate);
      expect(uriTemplates).toContain('demo://resource/dynamic/text/{resourceId}');
      expect(uriTemplates).toContain('demo://resource/dynamic/blob/{resourceId}');
    });
  });

  describe('resources/read via template', () => {
    clientHttpTest('should read a dynamic text resource via template [RESOURCE-002]', async ({ connector }) => {
      // server-everything dynamic text resource template: demo://resource/dynamic/text/{resourceId}
      const result = await connector.readResource(
        'demo://resource/dynamic/text/1',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0] as TextResourceContents;
      expect(content.uri).toBe('demo://resource/dynamic/text/1');
      expect(content.mimeType).toBe('text/plain');
      expect(content.text).toContain('Resource 1');
    });

    clientHttpTest('should read a dynamic blob resource via template [RESOURCE-003]', async ({ connector }) => {
      // server-everything dynamic blob resource template: demo://resource/dynamic/blob/{resourceId}
      const result = await connector.readResource(
        'demo://resource/dynamic/blob/2',
      );

      expect(result.contents).toHaveLength(1);

      const content = result.contents[0];
      expect(content.uri).toBe('demo://resource/dynamic/blob/2');
      expect('blob' in content).toBe(true);
    });
  });

  describe('resources/subscribe', () => {
    clientHttpTest('should subscribe to resource updates [RESOURCE-005]', async ({ connector }) => {
      const resources = await connector.listResources();
      expect(resources.length).toBeGreaterThan(0);

      await expect(
        connector.subscribeToResource(resources[0].uri),
      ).resolves.toBeUndefined();
    });
  });

  describe('resources/unsubscribe', () => {
    clientHttpTest('should unsubscribe from resource updates [RESOURCE-006]', async ({ connector }) => {
      const resources = await connector.listResources();
      expect(resources.length).toBeGreaterThan(0);

      // subscribe first
      await connector.subscribeToResource(resources[0].uri);

      // unsubscribe should not throw
      await expect(
        connector.unsubscribeFromResource(resources[0].uri),
      ).resolves.toBeUndefined();
    });
  });
});
