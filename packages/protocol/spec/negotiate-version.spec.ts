import { describe, expect, it } from 'vitest';

import { negotiateProtocolVersion } from '#negotiate-version';

describe('fn:negotiateProtocolVersion', () => {
  it('should return the requested version when it is in the supported list', () => {
    const supportedVersions = [
      '2025-06-18',
      '2025-03-26',
      '2024-11-05',
    ] as const;
    const requestedVersion = '2025-03-26';
    const expected = '2025-03-26';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should return the first supported version when requested version is not in the list', () => {
    const supportedVersions = [
      '2025-06-18',
      '2025-03-26',
      '2024-11-05',
    ] as const;
    const requestedVersion = '2024-10-01';
    const expected = '2025-06-18';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should handle single element array and return it when requested version does not match', () => {
    const supportedVersions = ['2025-06-18'] as const;
    const requestedVersion = '2024-11-05';
    const expected = '2025-06-18';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should handle single element array and return it when requested version matches', () => {
    const supportedVersions = ['2025-06-18'] as const;
    const requestedVersion = '2025-06-18';
    const expected = '2025-06-18';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should throw an error when supportedVersions array is empty', () => {
    const supportedVersions = [] as const;
    const requestedVersion = '2025-06-18';

    expect(() =>
      negotiateProtocolVersion(requestedVersion, supportedVersions),
    ).toThrow('supportedVersions array cannot be empty');
  });

  it('should work with different version format strings', () => {
    const supportedVersions = ['v2.0.0', 'v1.5.0', 'v1.0.0'] as const;
    const requestedVersion = 'v1.5.0';
    const expected = 'v1.5.0';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should return first version with semantic version formats when requested is not supported', () => {
    const supportedVersions = ['v2.0.0', 'v1.5.0', 'v1.0.0'] as const;
    const requestedVersion = 'v1.2.0';
    const expected = 'v2.0.0';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should handle case-sensitive version strings correctly', () => {
    const supportedVersions = ['V2.0.0', 'V1.5.0', 'V1.0.0'] as const;
    const requestedVersion = 'v1.5.0';
    const expected = 'V2.0.0';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should work with numeric version strings', () => {
    const supportedVersions = ['2', '1', '0'] as const;
    const requestedVersion = '1';
    const expected = '1';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });

  it('should prioritize exact matches over highest supported version', () => {
    const supportedVersions = ['3.0', '2.0', '1.0'] as const;
    const requestedVersion = '1.0';
    const expected = '1.0';

    const result = negotiateProtocolVersion(
      requestedVersion,
      supportedVersions,
    );

    expect(result).toBe(expected);
  });
});
