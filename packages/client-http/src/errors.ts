/**
 * unified error class for all HTTP transport failures
 *
 * simple error class that extends the standard Error class with a custom name
 * for consistent error handling across HTTP transport operations
 */
export class ExternalError extends Error {
  /**
   * creates new external error
   * @param message error message describing the failure
   */
  constructor(message: string) {
    super(message);
    this.name = 'ExternalError';
  }
}
