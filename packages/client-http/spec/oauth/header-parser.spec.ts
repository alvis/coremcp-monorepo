/**
 * tests WWW-Authenticate header parsing functionality
 *
 * verifies:
 * - parsing of WWW-Authenticate headers with various parameter formats
 * - extraction of resource metadata URLs
 * - extraction and splitting of OAuth scopes
 * - error handling for invalid header formats
 *
 * ensures WWW-Authenticate header parsing is critical for OAuth discovery and handles various formats according to RFC 6750
 */

import { describe, it, expect } from 'vitest';

import {
  parseWWWAuthenticate,
  isValidOAuthErrorCode,
} from '#oauth/header-parser';

import { SAMPLE_AUTH_HEADERS } from '../mocks/fixtures';

describe('WWW-Authenticate header parsing', () => {
  describe('fn:parseWWWAuthenticate', () => {
    it('should parse basic Bearer token challenge', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.BASIC_BEARER);

      expect(result.scheme).toBe('Bearer');
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should parse Bearer token challenge with scopes', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.WITH_SCOPES);

      expect(result.scheme).toBe('Bearer');
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
      expect(result.scopes).toEqual(['files:read', 'files:write']);
    });

    it('should parse Bearer token challenge with error information', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.WITH_ERROR);

      expect(result.scheme).toBe('Bearer');
      expect(result.error).toBe('insufficient_scope');
      expect(result.scopes).toEqual([
        'files:read',
        'files:write',
        'user:profile',
      ]);
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
      expect(result.errorDescription).toBe('Additional permissions required');
    });

    it('should handle unquoted parameter values', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.UNQUOTED_VALUES);

      expect(result.error).toBe('insufficient_scope');
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
    });

    it('should throw error when header value is empty', () => {
      expect(() => parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.EMPTY)).toThrow(
        'WWW-Authenticate header value is required',
      );
    });

    it('should handle invalid format gracefully', () => {
      expect(() =>
        parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.INVALID_FORMAT),
      ).not.toThrow();
    });

    it('should handle headers with only scheme and no parameters', () => {
      const result = parseWWWAuthenticate('Bearer');

      expect(result.scheme).toBe('Bearer');
      expect(result.resourceMetadata).toBeUndefined();
      expect(result.scopes).toEqual(undefined);
    });

    it('should handle malformed parameter pairs gracefully', () => {
      const result = parseWWWAuthenticate(
        'Bearer param_without_value, valid_param="value"',
      );

      expect(result.scheme).toBe('Bearer');
    });

    it('should parse realm parameter', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.WITH_REALM);

      expect(result.scheme).toBe('Bearer');
      expect(result.realm).toBe('OAuth API');
    });

    it('should parse error_uri parameter', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.WITH_ERROR_URI);

      expect(result.scheme).toBe('Bearer');
      expect(result.error).toBe('invalid_token');
      expect(result.errorUri).toBe('https://example.com/help/oauth');
    });

    it('should parse complete challenge with all RFC 6750 parameters', () => {
      const result = parseWWWAuthenticate(
        SAMPLE_AUTH_HEADERS.COMPLETE_CHALLENGE,
      );

      expect(result.scheme).toBe('Bearer');
      expect(result.realm).toBe('API');
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
      expect(result.scopes).toEqual(['files:read', 'files:write']);
      expect(result.error).toBe('insufficient_scope');
      expect(result.errorDescription).toBe('Token lacks required permissions');
      expect(result.errorUri).toBe('https://example.com/oauth/errors');
    });

    it('should handle escaped quotes in quoted strings', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.ESCAPED_QUOTES);

      expect(result.scheme).toBe('Bearer');
      expect(result.realm).toBe('API with "quotes"');
      expect(result.errorDescription).toBe('Error with "escaped quotes"');
    });

    it('should handle commas within quoted strings', () => {
      const result = parseWWWAuthenticate(SAMPLE_AUTH_HEADERS.COMMAS_IN_QUOTES);

      expect(result.scheme).toBe('Bearer');
      expect(result.realm).toBe('API, with commas');
      expect(result.errorDescription).toBe('Error, with commas');
    });

    it('should handle case-insensitive scheme matching', () => {
      const result = parseWWWAuthenticate(
        SAMPLE_AUTH_HEADERS.CASE_INSENSITIVE_SCHEME,
      );

      expect(result.scheme).toBe('bearer');
      expect(result.resourceMetadata).toBe(
        'https://mcp.example.com/.well-known/oauth-protected-resource',
      );
    });
  });

  describe('isValidOAuthErrorCode', () => {
    it('should return true for valid OAuth error codes', () => {
      expect(isValidOAuthErrorCode('invalid_request')).toBe(true);
      expect(isValidOAuthErrorCode('invalid_token')).toBe(true);
      expect(isValidOAuthErrorCode('insufficient_scope')).toBe(true);
    });

    it('should return false for invalid error codes', () => {
      expect(isValidOAuthErrorCode('unknown_error')).toBe(false);
      expect(isValidOAuthErrorCode('bad_request')).toBe(false);
      expect(isValidOAuthErrorCode('')).toBe(false);
      expect(isValidOAuthErrorCode('INVALID_TOKEN')).toBe(false); // case sensitive
    });

    it('should handle custom error codes', () => {
      // Custom error codes should return false since they're not standard
      expect(isValidOAuthErrorCode('custom_error')).toBe(false);
      expect(isValidOAuthErrorCode('server_error')).toBe(false);
    });
  });
});
