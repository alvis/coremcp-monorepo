/** timeout in milliseconds for resuming sessions with undelivered messages */
export const DEFAULT_RESUME_TIMEOUT_MS = 30000; // wait 30 seconds for any undelivered messages from previous contact and then assume there is no more message coming

/** interval in milliseconds for polling session storage for updates */
export const DEFAULT_PULL_INTERVAL_MS = 1000; // pull the session storage every second for any update

/** default inactivity timeout in milliseconds for session cleanup (5 minutes) */
export const DEFAULT_INACTIVITY_TIMEOUT_MS = 300000;
