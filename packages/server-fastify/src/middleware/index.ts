/**
 * @module middleware
 * @description Authentication middleware factories for securing MCP endpoints.
 * Provides middleware for external OAuth AS validation and proxy mode validation.
 */

export { createExternalAuthMiddleware } from './external-auth';

export { createProxyAuthMiddleware } from './proxy-auth';
