/**
 * tests session termination functionality
 *
 * verifies:
 * - graceful session termination requests via DELETE /mcp
 * - error handling (best-effort approach)
 * - integration-friendly request headers
 * - backward-compatible termination options
 */

import { describe, expect, it, vi } from 'vitest';

import { terminateSession } from '#session-termination';

import type { TerminateSessionParams } from '#session-termination';

describe('session termination', () => {
  const TEST_SESSION_ID = 'session-abc123';
  const TEST_SERVER_URL = 'https://mcp.example.com/mcp';

  describe('fn:terminateSession', () => {
    it('should send DELETE request with session id header by default', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(null, {
            status: 204,
          }),
      );

      await terminateSession({
        sessionId: TEST_SESSION_ID,
        serverUrl: TEST_SERVER_URL,
        fetch,
      });

      expect(fetch).toHaveBeenCalledOnce();
      expect(fetch).toHaveBeenCalledWith(
        TEST_SERVER_URL,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Mcp-Session-Id': TEST_SESSION_ID,
          }),
        }),
      );
      expect(fetch.mock.calls[0][1]!.body).toBeUndefined();
    });

    it('should remain compatible when a reason is provided', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(null, {
            status: 204,
          }),
      );

      await terminateSession({
        sessionId: TEST_SESSION_ID,
        serverUrl: TEST_SERVER_URL,
        reason: 'error',
        fetch,
      });

      expect(fetch).toHaveBeenCalledWith(
        TEST_SERVER_URL,
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'Mcp-Session-Id': TEST_SESSION_ID,
          }),
        }),
      );
    });

    it('should support all termination reasons without changing request shape', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(null, {
            status: 204,
          }),
      );

      const reasons: Array<TerminateSessionParams['reason']> = [
        'graceful',
        'error',
        'timeout',
      ];

      for (const reason of reasons) {
        fetch.mockClear();

        await terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          reason,
          fetch,
        });

        expect(fetch).toHaveBeenCalledWith(
          TEST_SERVER_URL,
          expect.objectContaining({
            method: 'DELETE',
            headers: expect.objectContaining({
              'Mcp-Session-Id': TEST_SESSION_ID,
            }),
          }),
        );
      }
    });

    it('should skip notification when sendNotification is false', async () => {
      const fetch = vi.fn();

      await terminateSession({
        sessionId: TEST_SESSION_ID,
        serverUrl: TEST_SERVER_URL,
        sendNotification: false,
        fetch,
      });

      expect(fetch).not.toHaveBeenCalled();
    });

    it('should silently ignore network errors (best-effort)', async () => {
      const fetch = vi.fn().mockRejectedValue(new Error('Network timeout'));

      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch,
        }),
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should silently ignore HTTP errors (best-effort)', async () => {
      const fetch = vi.fn().mockResolvedValue(
        new Response('Internal Server Error', {
          status: 500,
        }),
      );

      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch,
        }),
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should silently ignore DNS errors (best-effort)', async () => {
      const fetch = vi
        .fn()
        .mockRejectedValue(
          new Error('getaddrinfo ENOTFOUND invalid.example.com'),
        );

      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch,
        }),
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should use provided fetch implementation', async () => {
      const customFetch = vi.fn().mockResolvedValue(
        new Response(null, {
          status: 204,
        }),
      );

      await terminateSession({
        sessionId: TEST_SESSION_ID,
        serverUrl: TEST_SERVER_URL,
        fetch: customFetch,
      });

      expect(customFetch).toHaveBeenCalledOnce();
    });

    it('should send the session ID in the header and not the body', async () => {
      const fetch = vi.fn<typeof globalThis.fetch>(
        async () =>
          new Response(null, {
            status: 204,
          }),
      );

      await terminateSession({
        sessionId: TEST_SESSION_ID,
        serverUrl: TEST_SERVER_URL,
        reason: 'timeout',
        fetch,
      });

      expect(fetch.mock.calls[0][1]!.headers!['Mcp-Session-Id']).toBe(
        TEST_SESSION_ID,
      );
      expect(fetch.mock.calls[0][1]!.body).toBeUndefined();
    });
  });
});
