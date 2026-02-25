import { Session } from '@coremcp/core';
import { describe, expect, it } from 'vitest';

import { handleInitialize } from '#handlers/initialize';

import {
  abort,
  legacyInitializeParams,
  legacySession,
  minimalSession,
  session,
  sessionContext,
  sessionData,
  sessionWithComplexCapabilities,
  sessionWithCustomServerInfo,
  sessionWithDifferentVersion,
  sessionWithEmptyCapabilities,
  sessionWithUser,
  standardInitializeParams,
} from '../fixtures';

type Params = Parameters<typeof handleInitialize>[0];
type Context = Parameters<typeof handleInitialize>[1];

describe('fn:handleInitialize', () => {
  describe('default implementation', () => {
    it('should return initialization result from session', async () => {
      const context: Context = {
        session,
        abort,
      };

      const result = await handleInitialize(standardInitializeParams, context);

      expect(result).toEqual({
        protocolVersion: '2025-06-18',
        capabilities: {},
        serverInfo: {
          name: 'test-server',
          version: '1.0.0',
        },
      });
    });

    it('should return protocol version from session', async () => {
      const context: Context = {
        session: sessionWithDifferentVersion,
        abort,
      };

      const result = await handleInitialize(legacyInitializeParams, context);

      expect(result.protocolVersion).toBe('2025-03-26');
    });

    it('should return capabilities from session', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session: sessionWithEmptyCapabilities,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result.capabilities).toEqual({});
    });

    it('should return server info from session', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session: sessionWithCustomServerInfo,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result.serverInfo).toEqual({
        name: 'Custom Server',
        version: '2.0.0',
      });
    });

    it('should handle different protocol versions', async () => {
      const versionTestCases = [
        { version: '2024-11-05', session: legacySession },
        { version: '2025-03-26', session: sessionWithDifferentVersion },
        { version: '2025-06-18', session },
      ];

      for (const { version, session: testSession } of versionTestCases) {
        const params: Params = {
          protocolVersion: version,
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        };

        const requestContext: Context = {
          session: testSession,
          abort,
        };

        const result = await handleInitialize(params, requestContext);
        expect(result.protocolVersion).toBe(version);
      }
    });

    it('should handle complex server capabilities', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session: sessionWithComplexCapabilities,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result.capabilities).toEqual({
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
        completions: {},
      });
    });

    it('should handle minimal session capabilities', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session: minimalSession,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result.capabilities).toEqual({});
    });

    it('should return consistent results for sessions with different users', async () => {
      const params1: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };
      const params2: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context1: Context = {
        session,
        abort,
      };

      const context2: Context = {
        session: sessionWithUser,
        abort,
      };

      const result1 = await handleInitialize(params1, context1);
      const result2 = await handleInitialize(params2, context2);

      // results should be the same regardless of user
      expect(result1).toEqual(result2);
    });

    it('should handle sessions with different client info', async () => {
      const clientInfos = [
        { name: 'client1', version: '1.0.0' },
        { name: 'client2', version: '2.0.0' },
        { name: 'complex-client', version: '1.0.0-beta.1' },
      ];

      for (const clientInfo of clientInfos) {
        const sessionWithClientInfo = new Session(
          {
            ...sessionData,
            clientInfo,
          },
          sessionContext,
        );

        const params: Params = {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo,
        };

        const requestContext: Context = {
          session: sessionWithClientInfo,
          abort,
        };

        const result = await handleInitialize(params, requestContext);

        // should return server info from session, not client info
        expect(result.serverInfo).toEqual(session.serverInfo);
      }
    });
  });

  describe('parameter validation and response structure', () => {
    it('should handle initialize request with complete parameters', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result).toHaveProperty('protocolVersion');
      expect(result).toHaveProperty('capabilities');
      expect(result).toHaveProperty('serverInfo');
      expect(typeof result.protocolVersion).toBe('string');
      expect(typeof result.capabilities).toBe('object');
      expect(typeof result.serverInfo).toBe('object');
    });

    it('should return server info with name and version', async () => {
      const params: Params = {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      };

      const context: Context = {
        session,
        abort,
      };

      const result = await handleInitialize(params, context);

      expect(result.serverInfo).toHaveProperty('name');
      expect(result.serverInfo).toHaveProperty('version');
      expect(typeof result.serverInfo.name).toBe('string');
      expect(typeof result.serverInfo.version).toBe('string');
    });

    it('should return consistent structure regardless of session state', async () => {
      const sessions = [session, sessionWithUser, sessionWithDifferentVersion];

      const results = await Promise.all(
        sessions.map(async (s) => {
          const params: Params = {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          };
          const context: Context = {
            session: s,
            abort,
          };

          return handleInitialize(params, context);
        }),
      );

      // all results should have the same structure
      results.forEach((result) => {
        expect(result).toHaveProperty('protocolVersion');
        expect(result).toHaveProperty('capabilities');
        expect(result).toHaveProperty('serverInfo');
      });
    });
  });
});
