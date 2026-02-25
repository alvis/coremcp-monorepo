/**
 * negotiates the protocol version between client and server using highest-supported-first strategy
 * @param requestedVersion client's requested protocol version
 * @param supportedVersions array of supported protocol versions in preferred order
 * @returns negotiated protocol version from the supported list
 */
export function negotiateProtocolVersion<T extends readonly string[]>(
  requestedVersion: string,
  supportedVersions: T,
): T[number] {
  // Ensure supportedVersions is not empty
  if (supportedVersions.length === 0) {
    throw new Error('supportedVersions array cannot be empty');
  }

  // If client's requested version is in the supported list, use it
  if (supportedVersions.includes(requestedVersion)) {
    return requestedVersion;
  }

  // Fall back to the highest supported version (first in array)
  // this ensures the server can always communicate using its preferred version
  return supportedVersions[0];
}
