import { ExternalError } from '#errors';

import type { ProtectedResourceMetadata } from './types';

/**
 * fetches RFC 9728 Protected Resource Metadata from resource server
 *
 * discovers OAuth authorization server information and resource capabilities
 * by fetching the well-known protected resource metadata endpoint following
 * RFC 9728 specification for dynamic resource discovery
 *
 * security requirements per REQUIREMENTS.md:
 * - enforces HTTPS-only URLs to prevent token interception
 * - validates metadata URL format before making request
 * - wraps all fetch errors in ExternalError for consistent error handling
 * @param resourceUrl HTTPS URL of the protected resource server
 * @returns protected resource metadata with authorization server information
 * @throws {import('#errors').ExternalError} when URL is not HTTPS or fetch fails
 * @example
 * ```typescript
 * // Fetch metadata for MCP server
 * const metadata = await fetchResourceMetadata('https://mcp.example.com');
 * console.log(metadata.authorization_servers); // ['https://auth.example.com']
 * console.log(metadata.scopes_supported); // ['files:read', 'files:write']
 *
 * // Error: HTTP URLs are rejected
 * await fetchResourceMetadata('http://insecure.example.com'); // throws ExternalError
 * ```
 */
export async function fetchResourceMetadata(
  resourceUrl: string,
): Promise<ProtectedResourceMetadata> {
  if (!resourceUrl.startsWith('https://')) {
    throw new ExternalError('HTTPS required for resource metadata URL');
  }

  const metadataUrl = `${resourceUrl}/.well-known/oauth-protected-resource`;

  try {
    const response = await fetch(metadataUrl);

    if (!response.ok) {
      throw new ExternalError(
        `Failed to fetch resource metadata: ${response.status} ${response.statusText}`,
      );
    }

    const metadata = (await response.json()) as ProtectedResourceMetadata;

    return metadata;
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to fetch resource metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
