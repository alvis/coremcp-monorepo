import { ExternalError } from '#errors';

import type { ProtectedResourceMetadata } from './types';

const PROTECTED_RESOURCE_METADATA_PATH =
  '/.well-known/oauth-protected-resource';

function buildProtectedResourceMetadataUrl(resourceUrl: URL): {
  primary: string;
  fallback?: string;
} {
  const pathname =
    resourceUrl.pathname === '/' ? '' : resourceUrl.pathname.replace(/\/$/, '');

  return {
    primary: `${resourceUrl.origin}${PROTECTED_RESOURCE_METADATA_PATH}${pathname}`,
    fallback: pathname
      ? `${resourceUrl.origin}${PROTECTED_RESOURCE_METADATA_PATH}`
      : undefined,
  };
}

async function fetchMetadataUrl(
  metadataUrl: string,
): Promise<ProtectedResourceMetadata> {
  const response = await fetch(metadataUrl);

  if (!response.ok) {
    throw new ExternalError(
      `Failed to fetch resource metadata: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as ProtectedResourceMetadata;
}

/**
 * fetches protected resource metadata from a concrete metadata URL
 * @param metadataUrl full metadata URL from WWW-Authenticate or discovery
 * @returns protected resource metadata document
 */
export async function fetchResourceMetadataFromUrl(
  metadataUrl: string,
): Promise<ProtectedResourceMetadata> {
  const url = new URL(metadataUrl);

  if (url.protocol !== 'https:') {
    throw new ExternalError('HTTPS required for resource metadata URL');
  }

  try {
    return await fetchMetadataUrl(url.toString());
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to fetch resource metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

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
  const url = new URL(resourceUrl);

  if (url.protocol !== 'https:') {
    throw new ExternalError('HTTPS required for resource metadata URL');
  }

  const metadataUrls = buildProtectedResourceMetadataUrl(url);

  try {
    try {
      return await fetchMetadataUrl(metadataUrls.primary);
    } catch (error) {
      if (
        error instanceof ExternalError &&
        metadataUrls.fallback &&
        /Failed to fetch resource metadata: 4\d\d /.test(error.message)
      ) {
        return await fetchMetadataUrl(metadataUrls.fallback);
      }

      throw error;
    }
  } catch (error) {
    if (error instanceof ExternalError) {
      throw error;
    }

    throw new ExternalError(
      `Failed to fetch resource metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
