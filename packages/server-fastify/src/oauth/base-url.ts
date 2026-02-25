import type { FastifyRequest } from 'fastify';

import type { HTTPTransportOptions } from '#http';

import { inferBaseUrlFromRequest } from '#request-context';

/**
 * gets base url from request headers or fallback options
 * @param request fastify request object
 * @param options transport configuration options
 * @returns the base url string
 */
export function getBaseUrl(
  request: FastifyRequest,
  options: HTTPTransportOptions,
): string {
  return options.baseUrl ?? inferBaseUrlFromRequest(request);
}
