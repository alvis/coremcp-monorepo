import { describe, expect, it, vi } from 'vitest';

import { McpServer } from '#server';
import { ServerTransport, start, stop } from '#transport';

import { basicServerInfo, log } from './fixtures';

import type { ListTools } from '#types';

// test implementation of ServerTransport
class TestTransport extends ServerTransport {
  public startCalled = false;
  public stopCalled = false;

  public async [start](): Promise<void> {
    this.startCalled = true;
  }

  public async [stop](): Promise<void> {
    this.stopCalled = true;
  }
}

const listTools = vi.fn<ListTools>(async () => ({ tools: [] }));

const server = new McpServer({
  serverInfo: basicServerInfo,
  handlers: {
    listTools,
  },
});

const transport = new TestTransport({ log, mcpServer: server });

describe('cl:ServerTransport', () => {
  describe('constructor', () => {
    it('should handle SIGINT signal gracefully', async () => {
      const processOn = vi.spyOn(process, 'on');
      const transport = new TestTransport({ mcpServer: server, log });
      const stop = vi.spyOn(transport, 'stop').mockResolvedValue();

      // get the SIGINT handler - it should be one of the registered handlers
      const sigintCall = processOn.mock.calls.find(
        (call) => call[0] === 'SIGINT',
      );

      expect(sigintCall).toBeDefined();
      const sigintHandler = sigintCall![1] as () => Promise<void>;

      // call the SIGINT handler
      await sigintHandler();

      expect(log.mock.calls).toEqual([
        ['info', 'received SIGINT signal, initiating graceful shutdown'],
      ]);

      expect(stop).toHaveBeenCalled();
    });

    it('should handle SIGTERM signal gracefully', async () => {
      const processOn = vi.spyOn(process, 'on');
      const transport = new TestTransport({ mcpServer: server, log });
      const stop = vi.spyOn(transport, 'stop').mockResolvedValue();

      // get the SIGTERM handler
      const sigtermCall = processOn.mock.calls.find(
        (call) => call[0] === 'SIGTERM',
      );

      expect(sigtermCall).toBeDefined();
      const sigtermHandler = sigtermCall![1] as () => Promise<void>;

      // call the SIGTERM handler
      await sigtermHandler();

      expect(log.mock.calls).toEqual([
        ['info', 'received SIGTERM signal, initiating graceful shutdown'],
      ]);

      expect(stop).toHaveBeenCalled();
    });
  });

  describe('mt:start', () => {
    it('should start transport successfully', async () => {
      await transport.start();

      expect(transport.status.started).toBe(true);

      expect(log.mock.calls).toEqual([
        ['info', 'initializing transport server startup sequence'],
        [
          'info',
          'transport server started successfully and ready for connections',
        ],
      ]);
    });

    it('should not start transport if already started', async () => {
      await transport.start();
      await transport.start();

      expect(log.mock.calls).toContainEqual([
        'warn',
        'transport server already started, ignoring start request',
      ]);
    });
  });

  describe('mt:stop', () => {
    it('should stop transport successfully', async () => {
      await transport.start();
      await transport.stop();

      expect(transport.stopCalled).toBe(true);

      expect(transport.status.started).toBe(false);

      expect(log.mock.calls).toContainEqual([
        'info',
        'initiating transport server shutdown sequence',
      ]);

      expect(log.mock.calls).toContainEqual([
        'info',
        'transport server shutdown completed successfully',
      ]);
    });

    it('should not stop transport if not started', async () => {
      // create a fresh transport instance
      const notStartedTransport = new TestTransport({ mcpServer: server, log });

      await notStartedTransport.stop();

      expect(notStartedTransport.stopCalled).toBe(false);

      expect(log.mock.calls).toEqual([
        [
          'warn',
          'transport server not currently running, ignoring stop request',
        ],
      ]);
    });
  });

  describe('gt:server', () => {
    it('should return the McpServer instance', () => {
      const result = transport.server;

      expect(result).toBe(server);
    });
  });

  describe('gt:log', () => {
    it('should return the log function', () => {
      const result = transport.log;

      expect(result).toBe(log);
    });
  });

  describe('gt:status', () => {
    it('should return transport status information', () => {
      const status = transport.status;

      expect(status).toHaveProperty('started');

      expect(status).toHaveProperty('transport');

      expect(status).toHaveProperty('processInfo');

      expect(status).toHaveProperty('timestamp');

      expect(typeof status.started).toBe('boolean');

      expect(typeof status.transport).toBe('string');

      expect(typeof status.timestamp).toBe('string');

      expect(status.processInfo).toHaveProperty('pid');

      expect(status.processInfo).toHaveProperty('nodeVersion');

      expect(status.processInfo).toHaveProperty('platform');

      expect(status.processInfo).toHaveProperty('arch');

      expect(status.processInfo).toHaveProperty('uptime');

      expect(typeof status.processInfo.pid).toBe('number');

      expect(typeof status.processInfo.nodeVersion).toBe('string');

      expect(typeof status.processInfo.platform).toBe('string');

      expect(typeof status.processInfo.arch).toBe('string');

      expect(typeof status.processInfo.uptime).toBe('number');
    });

    it('should reflect current transport state', async () => {
      const statusTransport = new TestTransport({ mcpServer: server, log });

      const initialStatus = statusTransport.status;

      expect(initialStatus.started).toBe(false);

      await statusTransport.start();
      const startedStatus = statusTransport.status;

      expect(startedStatus.started).toBe(true);

      await statusTransport.stop();
      const stoppedStatus = statusTransport.status;

      expect(stoppedStatus.started).toBe(false);
    });

    it('should reflect logger presence', () => {
      const statusWithLogger = transport.status;

      expect(statusWithLogger).toHaveProperty('transport');

      const noLogTransport = new TestTransport({
        mcpServer: server,
      });
      const statusWithoutLogger = noLogTransport.status;

      expect(statusWithoutLogger).toHaveProperty('transport');
    });

    it('should include correct transport type', () => {
      const status = transport.status;

      expect(status.transport).toBe('TestTransport');
    });
  });
});
