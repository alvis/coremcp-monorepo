/** regex pattern for matching timestamp-indexed session files (e.g., "1234567890123-abc123...") */
export const SESSION_TIMESTAMP_REGEX = /^(\d+)-([A-Za-z0-9]{22})$/;

/** regex pattern for matching session json files (e.g., "abc123....json") */
export const SESSION_REGEX = /^([A-Za-z0-9]{22})\.json$/;
