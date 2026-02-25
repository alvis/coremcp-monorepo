/**
 * tests session termination functionality
 *
 * verifies:
 * - graceful session termination notifications
 * - error handling (best-effort approach)
 * - integration with disconnect flow
 * - different termination reasons
 */

import { describe, expect, it, vi } from 'vitest';

import { terminateSession } from '#session-termination';

import type { TerminateSessionParams } from '#session-termination';

describe('session termination', () => {
  const TEST_SESSION_ID = 'session-abc123';
  const TEST_SERVER_URL = 'https://mcp.example.com';

  describe('fn:terminateSession', () => {
    it('should send termination notification with graceful reason by default', async () => {
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
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Mcp-Session-Id': TEST_SESSION_ID,
          }),
        }),
      );

      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('notifications/session/terminated');
      expect(body.params.reason).toBe('graceful');
      expect(body.params.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body).not.toHaveProperty('id'); // notification, not request
    });

    it('should send termination notification with specified reason', async () => {
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

      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(body.params.reason).toBe('error');
    });

    it('should support all termination reasons', async () => {
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

        const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
        expect(body.params.reason).toBe(reason);
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

      // should not throw
      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch: fetch,
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

      // should not throw even when server returns error
      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch: fetch,
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

      // should not throw
      await expect(
        terminateSession({
          sessionId: TEST_SESSION_ID,
          serverUrl: TEST_SERVER_URL,
          fetch,
        }),
      ).resolves.toBeUndefined();

      expect(fetch).toHaveBeenCalledOnce();
    });

    it('should include current timestamp in ISO format', async () => {
      const beforeTimestamp = new Date().toISOString();

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

      const afterTimestamp = new Date().toISOString();

      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(body.params.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // timestamp should be between before and after
      expect(body.params.timestamp >= beforeTimestamp).toBe(true);
      expect(body.params.timestamp <= afterTimestamp).toBe(true);
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

    it('should send correct JSON-RPC 2.0 notification format', async () => {
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

      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);

      // validate JSON-RPC 2.0 notification structure
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('notifications/session/terminated');
      expect(body.params).toEqual({
        reason: 'timeout',
        timestamp: expect.any(String),
      });
      expect(body).not.toHaveProperty('id'); // notifications don't have id
    });

    it('should include session ID in header not body', async () => {
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

      // session ID in header
      expect(fetch.mock.calls[0][1]!.headers!['Mcp-Session-Id']).toBe(
        TEST_SESSION_ID,
      );

      // session ID not in body
      const body = JSON.parse(fetch.mock.calls[0][1]!.body as string);
      expect(body.params).not.toHaveProperty('sessionId');
    });
  });
});
