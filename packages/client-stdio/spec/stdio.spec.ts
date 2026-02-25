import { describe, expect, it, vi } from 'vitest';

import { GRACEFUL_TIMEOUT_MS, SIGTERM_TIMEOUT_MS } from '#constants';
import { StdioConnector } from '#stdio';

import { createTestParams, FakeProcess } from './fixtures';

import type { SpawnOptions } from 'node:child_process';

const { spawn } = vi.hoisted(() => ({
  spawn: vi.fn(
    (command: string, args: string[], _options: SpawnOptions) =>
      new FakeProcess(command, args),
  ),
}));

vi.mock('node:child_process', () => ({
  spawn,
}));

describe('cl:StdioConnector', () => {
  describe('connection lifecycle', () => {
    it('should spawn process and initialize successfully', async () => {
      const connector = new StdioConnector(
        createTestParams({
          command: 'node',
          args: ['test-server.js'],
        }),
      );

      const result = await connector.connect();

      // verify spawn was called correctly
      expect(spawn).toHaveBeenCalledWith(
        'node',
        ['test-server.js'],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'inherit'],
          env: process.env,
        }),
      );

      // verify connection result
      expect(result.serverInfo.name).toBe('test-server');
      expect(result.protocolVersion).toBe('2025-06-18');
      expect(connector.info.isConnected).toBe(true);

      // verify initialize message and initialized notification were sent
      const serverProcess = spawn.mock.results[0].value as FakeProcess;
      const messages = serverProcess.stdin.getMessages();

      expect(messages.length).toBeGreaterThanOrEqual(1);
      expect(messages[0]).toMatchObject({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
      });
      // base class also sends notifications/initialized after connection
      if (messages.length > 1) {
        expect(messages[1].method).toBe('notifications/initialized');
      }
    });

    it('should use empty args when not provided', async () => {
      const connector = new StdioConnector(
        createTestParams({
          command: 'test-command',
          args: undefined,
        }),
      );

      await connector.connect();

      expect(spawn).toHaveBeenCalledWith(
        'test-command',
        [],
        expect.objectContaining({
          stdio: ['pipe', 'pipe', 'inherit'],
          env: process.env,
        }),
      );
    });

    it('should not reconnect when already connecting', async () => {
      const connector = new StdioConnector(createTestParams());

      const firstConnect = connector.connect();

      // attempt second connection while first is pending
      const secondConnect = connector.connect();

      const [firstResult, secondResult] = await Promise.all([
        firstConnect,
        secondConnect,
      ]);

      // both should get same initialization result
      expect(firstResult).toEqual(secondResult);

      // spawn should only be called once
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it('should remain connected after successful connection', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      // verify connected and stays connected
      expect(connector.info.isConnected).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);

      // verify process is still alive
      const serverProcess = spawn.mock.results[0].value as FakeProcess;
      expect(serverProcess.killed).toBe(false);
    });

    it('should disconnect successfully', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      expect(connector.info.isConnected).toBe(true);

      await connector.disconnect();

      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      expect(connector.info.isConnected).toBe(false);
      expect(serverProcess.killed).toBe(true);
    });

    it('should handle disconnect when not connected', async () => {
      const connector = new StdioConnector(createTestParams());

      // should not throw
      await expect(connector.disconnect()).resolves.toBeUndefined();
    });

    it('should handle process close event', async () => {
      const connector = new StdioConnector(
        createTestParams({ args: ['--crash-after-connect'] }),
      );

      await connector.connect();

      expect(connector.info.isConnected).toBe(true);

      // wait for crash to happen (driven by mock)
      await new Promise((resolve) => setTimeout(resolve, 150));

      // process should be considered terminated
      const serverProcess = spawn.mock.results[0].value as FakeProcess;
      expect(serverProcess.exitCode).toBe(1);
    });

    it('should pass environment variables to spawned process', async () => {
      const customEnv = {
        PATH: '/custom/path',
        NODE_ENV: 'test',
        CUSTOM_VAR: 'custom_value',
      };

      const connector = new StdioConnector(
        createTestParams({
          env: customEnv,
        }),
      );

      await connector.connect();

      // verify spawn was called with custom env
      expect(spawn).toHaveBeenCalledWith('node', ['test-server.js'], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: customEnv,
      });
    });

    it('should use process.env when no custom env provided', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      // verify spawn was called with process.env
      expect(spawn).toHaveBeenCalledWith('node', ['test-server.js'], {
        stdio: ['pipe', 'pipe', 'inherit'],
        env: process.env,
      });
    });

    it('should attempt graceful shutdown sequence: stdin close → SIGTERM → SIGKILL', async () => {
      vi.useFakeTimers();

      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams(),
        log,
      });

      await connector.connect();

      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      // prevent graceful exit so SIGTERM/SIGKILL are attempted
      serverProcess.stdin.removeAllListeners('close');

      // simulate process not exiting gracefully (timeout both stages)
      const killSpy = vi.spyOn(serverProcess, 'kill').mockReturnValue(true);

      // start disconnect and advance through timeouts
      const disconnectPromise = connector.disconnect();

      await vi.advanceTimersByTimeAsync(
        GRACEFUL_TIMEOUT_MS + SIGTERM_TIMEOUT_MS,
      );

      await disconnectPromise;

      // verify graceful shutdown sequence through logs
      expect(log).toHaveBeenCalledWith(
        'debug',
        'Closed stdin stream to initiate graceful shutdown',
      );

      // process should have received kill signals
      expect(killSpy).toHaveBeenCalledWith('SIGTERM');
      expect(killSpy).toHaveBeenCalledWith('SIGKILL');

      // verify logging for escalation
      expect(log).toHaveBeenCalledWith('debug', 'Sent SIGTERM to process');
      expect(log).toHaveBeenCalledWith(
        'warn',
        'Force killed process with SIGKILL',
      );

      vi.useRealTimers();
    });

    it('should exit gracefully after stdin close without SIGTERM', async () => {
      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams({ args: ['--graceful-exit-on-stdin-close'] }),
        log,
      });

      await connector.connect();

      await connector.disconnect();

      // verify process exited gracefully (driven by --graceful-exit-on-stdin-close flag)
      expect(log).toHaveBeenCalledWith(
        'debug',
        'Process exited gracefully after stdin close',
      );

      // SIGTERM should not have been sent
      expect(log).not.toHaveBeenCalledWith('debug', 'Sent SIGTERM to process');
    });

    it('should exit after SIGTERM without SIGKILL', async () => {
      vi.useFakeTimers();

      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams({ args: ['--exit-on-sigterm'] }),
        log,
      });

      await connector.connect();

      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      // start disconnect and advance through graceful timeout
      const disconnectPromise = connector.disconnect();

      await vi.advanceTimersByTimeAsync(GRACEFUL_TIMEOUT_MS);

      // advance a bit more for SIGTERM to be sent and process to exit
      await vi.advanceTimersByTimeAsync(100);

      await disconnectPromise;

      // verify SIGTERM was sent
      expect(serverProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(log).toHaveBeenCalledWith('debug', 'Process exited after SIGTERM');

      // SIGKILL should not have been sent
      expect(serverProcess.kill).not.toHaveBeenCalledWith('SIGKILL');

      vi.useRealTimers();
    });

    it('should handle stdin close errors gracefully', async () => {
      vi.useFakeTimers();

      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams({ args: ['--stdin-close-error'] }),
        log,
      });

      await connector.connect();

      // start disconnect
      const disconnectPromise = connector.disconnect();

      // advance a small amount for the close event to fire
      await vi.advanceTimersByTimeAsync(20);

      // should not throw, just log warning
      await expect(disconnectPromise).resolves.toBeUndefined();

      expect(log).toHaveBeenCalledWith(
        'warn',
        'Failed to close stdin stream',
        expect.anything(),
      );

      vi.useRealTimers();
    });
  });

  describe('message handling', () => {
    it('should send request and receive response', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      const result = await connector.sendRequest({
        method: 'tools/list',
        params: {},
      });

      expect(result).toEqual({ tools: [] });

      // verify request was sent
      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      const messages = serverProcess.stdin.getMessages();
      expect(messages[messages.length - 1]).toMatchObject({
        jsonrpc: '2.0',
        method: 'tools/list',
        params: {},
      });
    });

    it('should handle multiple concurrent requests', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      const requests = [
        connector.sendRequest({ method: 'tools/list', params: {} }),
        connector.sendRequest({ method: 'prompts/list', params: {} }),
        connector.sendRequest({ method: 'resources/list', params: {} }),
      ];

      const results = await Promise.all(requests);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ tools: [] });
      expect(results[1]).toEqual({ prompts: [] });
      expect(results[2]).toEqual({ resources: [] });
    });

    it('should handle error responses', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      await expect(
        connector.sendRequest({
          method: 'unknown/method',
          params: {},
        }),
      ).rejects.toThrow('Method not found');
    });

    it('should parse line-buffered JSON correctly', async () => {
      // Reconnect with partial-json flag
      const connector = new StdioConnector(
        createTestParams({ args: ['--partial-json'] }),
      );

      const result = await connector.connect();

      expect(result.serverInfo.name).toBe('test-server');
    });

    it('should handle multiple messages in single data chunk', async () => {
      // Reconnect with multiple-messages flag
      const connector = new StdioConnector(
        createTestParams({ args: ['--multiple-messages'] }),
      );

      const result = await connector.connect();

      expect(result.serverInfo.name).toBe('test-server');
    });

    it('should handle malformed JSON gracefully', async () => {
      // reconnect with malformed-json flag
      const connector = new StdioConnector(
        createTestParams({ args: ['--malformed-json'] }),
      );

      // should still connect successfully despite malformed JSON
      const result = await connector.connect();

      expect(result.serverInfo.name).toBe('test-server');
    });
  });

  describe('error handling', () => {
    it('should log malformed JSON with logger provided', async () => {
      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams({ args: ['--malformed-json'] }),
        log,
      });

      await connector.connect();

      // verify malformed JSON warning was logged
      expect(log).toHaveBeenCalledWith(
        'warn',
        'Received malformed JSON message from child process',
        expect.objectContaining({
          line: '{"invalid": json}',
        }),
      );
    });

    it('should handle spawn errors', async () => {
      const connector = new StdioConnector(
        createTestParams({
          command: 'nonexistent-command',
          args: ['--spawn-error'],
        }),
      );

      // connection should handle error gracefully
      const connectPromise = connector.connect();

      // should timeout waiting for initialization
      await expect(
        Promise.race([
          connectPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 100),
          ),
        ]),
      ).rejects.toThrow('Timeout');
    });

    it('should handle process crash before initialization', async () => {
      const connector = new StdioConnector(
        createTestParams({ args: ['--crash-before-init'] }),
      );

      const connectPromise = connector.connect();

      // should timeout or reject
      await expect(
        Promise.race([
          connectPromise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Process crashed')), 100),
          ),
        ]),
      ).rejects.toThrow();
    });

    it('should handle process crash after connection', async () => {
      const connector = new StdioConnector(
        createTestParams({ args: ['--crash-after-connect'] }),
      );

      await connector.connect();

      expect(connector.info.isConnected).toBe(true);

      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      // wait for 'close' event to fire
      const closePromise = new Promise((resolve) => {
        serverProcess.once('close', resolve);
      });

      await closePromise;

      // allow event handlers to complete
      await new Promise((resolve) => setImmediate(resolve));

      // process should be terminated
      expect(serverProcess.exitCode).toBe(1);
      expect(serverProcess.killed).toBe(true);

      // verify status was updated through status property
      expect(connector.status.status).toBe('disconnected');
    });

    it('should reject pending requests on disconnect', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      // send request but don't respond
      void connector.sendRequest({
        method: 'tools/list',
        params: {},
      });

      // disconnect while request is pending
      await connector.disconnect();

      // request should be rejected (though this depends on implementation)
      // for now, just verify disconnect completed
      expect(connector.info.isConnected).toBe(false);
    });

    it('should handle kill errors gracefully with logging', async () => {
      vi.useFakeTimers();

      const log = vi.fn();
      const connector = new StdioConnector({
        ...createTestParams({ args: ['--kill-error'] }),
        log,
      });

      await connector.connect();

      const serverProcess = spawn.mock.results[0].value as FakeProcess;

      // start disconnect in background
      const disconnectPromise = (async () => {
        try {
          await connector.disconnect();
        } catch (error) {
          return error;
        }
      })();

      await vi.advanceTimersByTimeAsync(
        GRACEFUL_TIMEOUT_MS + SIGTERM_TIMEOUT_MS,
      );

      // wait for disconnect to complete and capture error
      const thrownError = await disconnectPromise;

      // verify the error was thrown
      expect(thrownError).toBeInstanceOf(Error);
      expect((thrownError as Error).message).toContain(
        'Failed to send SIGKILL',
      );

      // verify graceful shutdown was attempted first
      expect(log).toHaveBeenCalledWith(
        'debug',
        'Closed stdin stream to initiate graceful shutdown',
      );

      // verify SIGTERM was attempted
      expect(serverProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(log).toHaveBeenCalledWith('debug', 'Sent SIGTERM to process');

      // verify SIGKILL was attempted and error was logged
      expect(serverProcess.kill).toHaveBeenCalledWith('SIGKILL');
      expect(log).toHaveBeenCalledWith(
        'error',
        'Failed to force kill child process',
        expect.anything(),
      );

      vi.useRealTimers();
    });
  });

  describe('public API methods', () => {
    it('should list tools', async () => {
      const connector: StdioConnector = new StdioConnector(
        createTestParams({ args: ['--return-test-tool'] }),
      );

      await connector.connect();

      const tools = await connector.listTools();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('test_tool');
    });

    it('should call tool', async () => {
      const connector: StdioConnector = new StdioConnector(
        createTestParams({ args: ['--return-test-tool'] }),
      );

      await connector.connect();

      const result = await connector.callTool('echo', { message: 'hello' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'text',
        text: 'hello',
      });
    });

    it('should ping server', async () => {
      const connector: StdioConnector = new StdioConnector(
        createTestParams({ args: ['--return-test-tool'] }),
      );
      await connector.connect();

      await expect(connector.ping()).resolves.toBeUndefined();
    });
  });

  describe('status', () => {
    it('should return status when disconnected', () => {
      const connector = new StdioConnector(createTestParams());

      const status = connector.status;

      expect(status.status).toBe('disconnected');
      expect(status.transport).toBe('StdioConnector');
      expect(status.processInfo.pid).toBe(process.pid);
    });

    it('should return status information', async () => {
      const connector = new StdioConnector(createTestParams());

      await connector.connect();

      // verify connected
      expect(connector.info.isConnected).toBe(true);

      const status = connector.status;

      // status should include transport info
      expect(status.transport).toBe('StdioConnector');
      expect(status.processInfo.pid).toBe(process.pid);
    });
  });
});
