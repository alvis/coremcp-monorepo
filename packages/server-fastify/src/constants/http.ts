/**
 * HTTP 200 OK status code
 * @description standard response for successful HTTP requests.
 */
export const HTTP_OK = 200;
/**
 * HTTP 201 Created status code
 * @description the request has been fulfilled and resulted in a new resource being created.
 */
export const HTTP_CREATED = 201;
/**
 * HTTP 204 No Content status code
 * @description the server successfully processed the request but is not returning any content.
 */
export const HTTP_NO_CONTENT = 204;
/**
 * HTTP 302 Found status code
 * @description indicates that the resource requested has been temporarily moved to another URI.
 */
export const HTTP_FOUND = 302;
/**
 * HTTP 400 Bad Request status code
 * @description the server cannot or will not process the request due to client error.
 * @example
 * ```typescript
 * if (!request.headers['mcp-protocol-version']) {
 *   reply.code(HTTP_BAD_REQUEST).send({ error: 'Missing protocol version' });
 * }
 * ```
 */
export const HTTP_BAD_REQUEST = 400;
/**
 * HTTP 404 Not Found status code
 * @description the requested resource could not be found on the server.
 */
export const HTTP_NOT_FOUND = 404;
/**
 * HTTP 406 Not Acceptable status code
 * @description the requested resource is capable of generating only content not acceptable
 * according to the Accept headers sent in the request.
 */
export const HTTP_NOT_ACCEPTABLE = 406;
/**
 * HTTP 405 Method Not Allowed status code
 * @description the request method is not supported for the requested resource.
 */
export const HTTP_METHOD_NOT_ALLOWED = 405;
/**
 * HTTP 415 Unsupported Media Type status code
 * @description the media format of the requested data is not supported by the server.
 */
export const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
/**
 * HTTP 500 Internal Server Error status code
 * @description a generic error message when the server encounters an unexpected condition.
 */
export const HTTP_INTERNAL_SERVER_ERROR = 500;
/**
 * HTTP 501 Not Implemented status code
 * @description the server either does not recognize the request method or lacks the ability
 * to fulfill the request.
 */
export const HTTP_NOT_IMPLEMENTED = 501;

/**
 * HTTP 401 Unauthorized status code
 * @description authentication is required and has failed or has not been provided.
 */
export const HTTP_UNAUTHORIZED = 401;
/**
 * HTTP 403 Forbidden status code
 * @description the request was a valid request, but the server is refusing to respond.
 */
export const HTTP_FORBIDDEN = 403;
/**
 * HTTP 408 Request Timeout status code
 * @description the server did not receive a complete request within the time limit.
 */
export const HTTP_REQUEST_TIMEOUT = 408;
/**
 * HTTP 409 Conflict status code
 * @description the request could not be completed due to a conflict with the current state.
 */
export const HTTP_CONFLICT = 409;
/**
 * HTTP 413 Payload Too Large status code
 * @description the request entity is larger than limits defined by the server.
 */
export const HTTP_PAYLOAD_TOO_LARGE = 413;
/**
 * HTTP 429 Too Many Requests status code
 * @description the user has sent too many requests in a given amount of time.
 */
export const HTTP_TOO_MANY_REQUESTS = 429;
/**
 * HTTP 503 Service Unavailable status code
 * @description the server is currently unavailable due to maintenance or overload.
 */
export const HTTP_SERVICE_UNAVAILABLE = 503;
