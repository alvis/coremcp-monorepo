import type { JsonifibleObject, McpLogLevel } from '@coremcp/protocol';

/** logging levels in order of severity from lowest to highest */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** formats log messages */
export type Log = (
  level: LogLevel,
  message: string,
  meta?: JsonifibleObject,
) => void;

/**
 * maps mcp log level to internal log level
 * @param level mcp log level to map
 * @returns corresponding internal log level
 */
export function mapMcpLogLevel(level: McpLogLevel): LogLevel {
  switch (level) {
    case 'emergency':
      return 'fatal';
    case 'alert':
    case 'critical':
    case 'error':
      return 'error';
    case 'warning':
      return 'warn';
    case 'notice':
    case 'info':
      return 'info';
    case 'debug':
    default:
      return 'debug';
  }
}
