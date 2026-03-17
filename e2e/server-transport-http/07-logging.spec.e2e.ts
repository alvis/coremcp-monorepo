/**
 * E2E tests for logging via HTTP transport using HttpMcpConnector
 *
 * validates setting log levels, server-initiated log notifications,
 * log level filtering behavior, and notification payload structure
 * against the coremcp test server.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import { createServerHttpClientContext } from '../fixtures/index';

import type { LoggingMessageNotification, McpLogLevel, McpServerNotification } from '@coremcp/protocol';

import type { ServerHttpClientContext } from '../fixtures/index';

// TYPES //

/** text content item from tool result */
interface TextContentItem {
  type: 'text';
  text: string;
}

/** tool call result shape */
interface ToolCallResult {
  content: TextContentItem[];
}

// TEST SUITES //

describe('e2e:server-transport-http/logging', () => {
  let ctx: ServerHttpClientContext;

  beforeAll(async () => {
    ctx = await createServerHttpClientContext();
    await ctx.connector.connect();
  }, 60_000);

  afterAll(async () => {
    await ctx.teardown();
  });

  it('should set log level to debug [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that logging/setLevel request with 'debug' level resolves successfully.
     * per spec, clients MAY send logging/setLevel to configure the minimum log level.
     * The server stores the level and returns an empty result ({}).
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler: setLevel handler stores level, returns {})
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1631 (LoggingLevelSchema enum)
     */
    await expect(ctx.connector.setLogLevel('debug')).resolves.toBeUndefined();
  });

  it('should set log level to info [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that logging/setLevel request with 'info' level resolves successfully.
     * per spec, clients MAY send logging/setLevel to configure the minimum log level.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('info')).resolves.toBeUndefined();
  });

  it('should set log level to warning [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that logging/setLevel request with 'warning' level resolves successfully.
     * per spec, clients MAY send logging/setLevel to configure the minimum log level.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('warning')).resolves.toBeUndefined();
  });

  it('should set log level to error [LOGGING-001]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that logging/setLevel request with 'error' level resolves successfully.
     * per spec, clients MAY send logging/setLevel to configure the minimum log level.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L122-L132 (_registerLoggingHandler)
     */
    await expect(ctx.connector.setLogLevel('error')).resolves.toBeUndefined();
  });

  it('should trigger server-initiated log notification [LOGGING-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that the server can send log notifications via notifications/message.
     * per spec, servers send log messages using notifications/message with params
     * containing level (LoggingLevel), data (any JSON value), and optional logger (string).
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#log-message-notifications
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L654-L658 (sendLoggingMessage)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1653-L1666 (LoggingMessageNotificationParams: level, logger?, data)
     */
    const result = await ctx.connector.callTool('trigger-log', {
      level: 'info',
      data: 'test log message',
      logger: 'e2e-test',
    });

    const toolResult = result as ToolCallResult;
    expect(toolResult.content).toHaveLength(1);
    expect(toolResult.content[0]).toEqual({
      type: 'text',
      text: 'Log notification sent at level: info',
    });
  });

  it('should trigger log notification at different levels [LOGGING-002]', async () => {
    // SPEC ALIGNMENT: PASS
    /**
     * verifies that log notifications can be triggered at multiple severity levels.
     * per spec, the server supports 8 RFC 5424 log levels and sends notifications/message
     * for each. This test exercises debug, warning, and error levels.
     * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#log-levels
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L654-L658 (sendLoggingMessage)
     * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1631 (LoggingLevelSchema: debug|info|notice|warning|error|critical|alert|emergency)
     */
    const levels = ['debug', 'warning', 'error'];

    for (const level of levels) {
      const result = await ctx.connector.callTool('trigger-log', {
        level,
        data: `${level} message`,
      });

      const toolResult = result as ToolCallResult;
      expect(toolResult.content[0]).toEqual({
        type: 'text',
        text: `Log notification sent at level: ${level}`,
      });
    }
  });

  describe('log level filtering [LOGGING-001]', () => {
    it('should receive error-level log after setting level to warning [LOGGING-001]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies log level filtering: after setting level to 'warning', the server
       * should only send notifications at warning severity or higher. Info-level
       * messages should be filtered out. per spec, the server SHOULD send all logs at
       * the configured level and higher (more severe). The SDK uses severity index
       * comparison: isMessageIgnored returns true when message level < configured level.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#setting-log-level
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L175-L184 (isMessageIgnored: severity index filtering)
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/server/src/server/server.ts#L654-L658 (sendLoggingMessage checks isMessageIgnored)
       */
      const notifications: McpServerNotification[] = [];

      const notifyCtx = await createServerHttpClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        // set log level to warning -- server should only send warning+ notifications
        await notifyCtx.connector.setLogLevel('warning');

        // trigger an info-level log (below warning threshold)
        await notifyCtx.connector.callTool('trigger-log', {
          level: 'info',
          data: 'info should be filtered',
        });

        // trigger an error-level log (at or above warning threshold)
        await notifyCtx.connector.callTool('trigger-log', {
          level: 'error',
          data: 'error should arrive',
        });

        // allow time for notifications to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        // verify at least one log notification was received
        const logNotifications = notifications.filter(
          (n) => n.method === 'notifications/message',
        );
        expect(logNotifications.length).toBeGreaterThanOrEqual(1);

        // verify the error-level notification is present
        const errorNotifications = logNotifications.filter(
          (n) =>
            n.method === 'notifications/message' &&
            (n as LoggingMessageNotification).params.level === 'error',
        );
        expect(errorNotifications.length).toBeGreaterThanOrEqual(1);

        // verify lower-priority levels (below warning) are filtered out
        const infoNotifications = logNotifications.filter(
          (n) =>
            (n as LoggingMessageNotification).params.level === 'info',
        );
        expect(infoNotifications).toHaveLength(0);
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });

  describe('log notification payload [LOGGING-002]', () => {
    it('should include level, data, and logger fields in notification [LOGGING-002]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies the structure of notifications/message payload. per spec, the
       * notification params must include level (LoggingLevel), data (any JSON value),
       * and optionally logger (string identifying the source).
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#log-message-notifications
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1653-L1666 (LoggingMessageNotificationParams: level, logger?, data)
       */
      const notifications: McpServerNotification[] = [];

      const notifyCtx = await createServerHttpClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await notifyCtx.connector.connect();

        // trigger a log with all fields populated
        await notifyCtx.connector.callTool('trigger-log', {
          level: 'info',
          data: 'payload test message',
          logger: 'e2e-payload-test',
        });

        // allow time for the notification to arrive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const logNotifications = notifications.filter(
          (n) => n.method === 'notifications/message',
        );
        expect(logNotifications.length).toBeGreaterThanOrEqual(1);

        // verify the notification payload structure
        const logNotification =
          logNotifications[0] as LoggingMessageNotification;
        expect(logNotification.params).toBeDefined();
        expect(logNotification.params.level).toBe('info');
        expect(logNotification.params.data).toBe('payload test message');
        expect(logNotification.params.logger).toBe('e2e-payload-test');
      } finally {
        await notifyCtx.teardown();
      }
    }, 30_000);
  });

  describe('all 8 standard log levels [LOGGING-003]', () => {
    it('should emit notifications for all 8 RFC 5424 log levels [LOGGING-003]', async () => {
      // SPEC ALIGNMENT: PASS
      /**
       * verifies that all 8 RFC 5424 log levels defined by the spec are supported:
       * debug, info, notice, warning, error, critical, alert, emergency.
       * per spec, the LoggingLevel enum maps to these syslog severity levels.
       * @see https://modelcontextprotocol.io/specification/2025-11-25/server/utilities/logging#log-levels
       * @see https://github.com/modelcontextprotocol/typescript-sdk/blob/ccb78f20438a853f0205b8ed7f642af7780208e6/packages/core/src/types/types.ts#L1631 (LoggingLevelSchema = z.enum(['debug','info','notice','warning','error','critical','alert','emergency']))
       */
      const allLevels: McpLogLevel[] = [
        'debug',
        'info',
        'notice',
        'warning',
        'error',
        'critical',
        'alert',
        'emergency',
      ];
      const notifications: McpServerNotification[] = [];

      const levelsCtx = await createServerHttpClientContext({
        onNotification: async (notification) => {
          notifications.push(notification);
        },
      });

      try {
        await levelsCtx.connector.connect();

        // set log level to debug so all levels pass through
        await levelsCtx.connector.setLogLevel('debug');

        for (const level of allLevels) {
          await levelsCtx.connector.callTool('trigger-log', {
            level,
            data: `${level} level test message`,
          });
        }

        // allow time for all notifications to arrive
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const logNotifications = notifications.filter(
          (n) => n.method === 'notifications/message',
        ) as LoggingMessageNotification[];

        const receivedLevels = logNotifications.map((n) => n.params.level);

        for (const level of allLevels) {
          expect(receivedLevels).toContain(level);
        }
      } finally {
        await levelsCtx.teardown();
      }
    }, 30_000);
  });
});
