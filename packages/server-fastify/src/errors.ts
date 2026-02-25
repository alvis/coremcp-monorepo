import type { JsonObject } from '@coremcp/protocol';

/**
 * HTTP error with customizable status code, headers, and response body
 */
export class HTTPError extends Error {
  public readonly code: number;
  public readonly headers: Record<string, string>;
  public readonly body: string;

  /**
   * creates an http error with the specified code, headers, and body
   * @param params error parameters
   * @param params.code http status code
   * @param params.headers optional http headers
   * @param params.body optional response body as json object
   */
  constructor(params: {
    code: number;
    headers?: Record<string, string>;
    body?: JsonObject;
  }) {
    super();

    const { code, headers, body } = params;

    this.code = code;
    this.headers = {
      'content-type': body ? 'application/json' : 'text/plain',
      ...headers,
    };
    this.body = body ? JSON.stringify(body, null, 2) : '';
  }
}
