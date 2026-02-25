import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createRequireAuth } from '#oauth/resource-server/middleware';

import type { FastifyReply, FastifyRequest } from 'fastify';

import type { TokenInfo } from '#oauth/types';

const HOUR_IN_SECONDS = 3600;

describe('OAuth Resource Server Middleware', () => {
  describe('fn:createRequireAuth', () => {
    it('should reject requests without authorization header', async () => {
      const request: Partial<FastifyRequest> = {
        headers: {},
        log: {
          error: vi.fn(),
        } as unknown as FastifyRequest['log'],
      };
      const reply: Partial<FastifyReply> = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
      const tokenVerifier = vi.fn();
      const middleware = createRequireAuth({
        introspect: tokenVerifier,
        issuer: undefined,
        requiredScopes: ['mcp'],
      });

      await (middleware as (req: unknown, rep: unknown) => Promise<void>)(
        request,
        reply,
      );

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('Bearer realm="MCP Server"'),
      );
      expect(reply.send).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description:
          'No authorization header present. Include "Authorization: Bearer <token>" header.',
      });
    });

    it('should reject requests with invalid authorization header format', async () => {
      const request: Partial<FastifyRequest> = {
        headers: { authorization: 'Basic dXNlcjpwYXNz' },
        log: {
          error: vi.fn(),
        } as unknown as FastifyRequest['log'],
      };
      const reply: Partial<FastifyReply> = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
      const tokenVerifier = vi.fn();
      const middleware = createRequireAuth({
        introspect: tokenVerifier,
        issuer: undefined,
        requiredScopes: ['mcp'],
      });

      await (middleware as (req: unknown, rep: unknown) => Promise<void>)(
        request,
        reply,
      );

      expect(reply.code).toHaveBeenCalledWith(401);
      expect(reply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('error="invalid_request"'),
      );
    });

    let mockTokenVerifier: ((token: string) => Promise<TokenInfo>) | undefined;
    let issuer: string | undefined;
    let mockRequest: Partial<FastifyRequest>;
    let mockReply: Partial<FastifyReply>;

    beforeEach(() => {
      mockTokenVerifier = undefined;
      issuer = undefined;
      mockRequest = {
        headers: {},
        log: {
          error: vi.fn(),
        } as unknown as FastifyRequest['log'],
      };
      mockReply = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
      };
    });

    it('should validate token using token verifier', async () => {
      const mockTokenInfo: TokenInfo = {
        active: true,
        client_id: 'test-client',
        scope: 'mcp read',
        exp: Math.floor(Date.now() / 1000) + HOUR_IN_SECONDS,
      };

      // Configure mock token verifier
      mockTokenVerifier = vi.fn().mockResolvedValue(mockTokenInfo);
      issuer = 'https://auth.example.com';
      mockRequest.headers = { authorization: 'Bearer test-token' };

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      expect(mockTokenVerifier).toHaveBeenCalledWith('test-token');
      expect(mockReply.code).not.toHaveBeenCalled();
    });

    it('should reject expired tokens', async () => {
      const expiredTokenInfo: TokenInfo = {
        active: true,
        client_id: 'test-client',
        scope: 'mcp',
        exp: Math.floor(Date.now() / 1000) - HOUR_IN_SECONDS, // expired
      };

      // Configure mock token verifier to return expired token
      mockTokenVerifier = vi.fn().mockResolvedValue(expiredTokenInfo);
      mockRequest.headers = { authorization: 'Bearer expired-token' };

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description:
          'The access token has expired. Obtain a new token from the authorization server.',
      });
    });

    it('should reject tokens with insufficient scopes', async () => {
      const limitedTokenInfo: TokenInfo = {
        active: true,
        client_id: 'test-client',
        scope: 'mcp', // missing 'admin' scope
        exp: Math.floor(Date.now() / 1000) + HOUR_IN_SECONDS,
      };

      // Configure mock token verifier
      mockTokenVerifier = vi.fn().mockResolvedValue(limitedTokenInfo);
      mockRequest.headers = { authorization: 'Bearer limited-token' };

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp', 'admin'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      // RFC 6750 Section 3.1: insufficient_scope errors use 403 Forbidden
      expect(mockReply.code).toHaveBeenCalledWith(403);
      expect(mockReply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('error="insufficient_scope"'),
      );
      expect(mockReply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('Required scope(s): mcp admin'),
      );
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'forbidden',
        error_description: 'Required scope(s): mcp admin',
      });
    });

    it('should reject inactive tokens', async () => {
      const inactiveTokenInfo: TokenInfo = {
        active: false,
        client_id: 'test-client',
      };

      // Configure mock token verifier
      mockTokenVerifier = vi.fn().mockResolvedValue(inactiveTokenInfo);
      mockRequest.headers = { authorization: 'Bearer inactive-token' };

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description:
          'The access token is invalid or has been revoked. Obtain a new token from the authorization server.',
      });
    });

    it('should handle token validation errors', async () => {
      // Configure mock token verifier to throw error
      mockTokenVerifier = vi.fn().mockRejectedValue(new Error('Network error'));
      mockRequest = {
        headers: { authorization: 'Bearer error-token' },
        url: '/test',
        log: {
          error: vi.fn(),
        } as unknown as FastifyRequest['log'],
      };

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'unauthorized',
        error_description:
          'Token validation failed due to introspection error. Check authorization server connectivity.',
      });
    });

    it('should include issuer in WWW-Authenticate header', async () => {
      // Configure issuer
      issuer = 'https://auth.example.com';
      mockTokenVerifier = vi.fn();

      const middleware = createRequireAuth({
        introspect: mockTokenVerifier,
        issuer,
        requiredScopes: ['mcp'],
      });

      await middleware.call(
        {} as any,
        mockRequest as FastifyRequest,
        mockReply as FastifyReply,
      );

      expect(mockReply.header).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('authz_server="https://auth.example.com"'),
      );
    });
  });
});
