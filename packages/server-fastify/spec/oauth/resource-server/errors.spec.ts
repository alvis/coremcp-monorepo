import { describe, expect, it } from 'vitest';

import {
  OAuthErrorCode,
  buildWWWAuthenticateHeader,
  createOAuthError,
} from '#oauth/resource-server/errors';

describe('OAuth Errors', () => {
  describe('fn:createOAuthError', () => {
    it('should create error with code only', () => {
      const result = createOAuthError(OAuthErrorCode.InvalidToken);
      const expected = { error: 'invalid_token' };

      expect(result).toEqual(expected);
    });

    it('should create error with code and description', () => {
      const result = createOAuthError(
        OAuthErrorCode.InvalidRequest,
        'Missing parameter',
      );
      const expected = {
        error: 'invalid_request',
        error_description: 'Missing parameter',
      };

      expect(result).toEqual(expected);
    });

    it('should create error with code, description, and uri', () => {
      const result = createOAuthError(
        OAuthErrorCode.InvalidToken,
        'Access token expired',
        'https://docs.example.com/errors#invalid_token',
      );
      const expected = {
        error: 'invalid_token',
        error_description: 'Access token expired',
        error_uri: 'https://docs.example.com/errors#invalid_token',
      };

      expect(result).toEqual(expected);
    });
  });

  describe('fn:buildWWWAuthenticateHeader', () => {
    it('should build basic header', () => {
      const result = buildWWWAuthenticateHeader();
      const expected = 'Bearer realm="MCP Server"';

      expect(result).toBe(expected);
    });

    it('should build header with error', () => {
      const result = buildWWWAuthenticateHeader(
        'MCP Server',
        'invalid_token',
        'Token expired',
      );

      expect(result).toContain('Bearer realm="MCP Server"');
      expect(result).toContain('error="invalid_token"');
      expect(result).toContain('error_description="Token expired"');
    });

    it('should build header with scope parameter', () => {
      const result = buildWWWAuthenticateHeader(
        'MCP Server',
        'insufficient_scope',
        'Requires mcp:admin scope',
        undefined,
        'mcp:admin',
      );

      expect(result).toContain('Bearer realm="MCP Server"');
      expect(result).toContain('error="insufficient_scope"');
      expect(result).toContain('error_description="Requires mcp:admin scope"');
      expect(result).toContain('scope="mcp:admin"');
    });

    it('should build header with authz_server parameter', () => {
      const result = buildWWWAuthenticateHeader(
        'MCP Server',
        'invalid_token',
        'Token validation failed',
        'https://auth.example.com',
      );

      expect(result).toContain('Bearer realm="MCP Server"');
      expect(result).toContain('error="invalid_token"');
      expect(result).toContain('error_description="Token validation failed"');
      expect(result).toContain('authz_server="https://auth.example.com"');
    });

    it('should build header with all parameters', () => {
      const result = buildWWWAuthenticateHeader(
        'MCP Server',
        'insufficient_scope',
        'Access denied',
        'https://auth.example.com',
        'mcp:admin',
      );

      expect(result).toContain('Bearer realm="MCP Server"');
      expect(result).toContain('error="insufficient_scope"');
      expect(result).toContain('error_description="Access denied"');
      expect(result).toContain('scope="mcp:admin"');
      expect(result).toContain('authz_server="https://auth.example.com"');
    });
  });
});
