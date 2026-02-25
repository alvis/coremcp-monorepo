import fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { registerUtilityRoutes } from '#routes/utility';

describe('registerUtilityRoutes', () => {
  it('should return healthy status from health endpoint', async () => {
    const app = fastify();
    await app.register(registerUtilityRoutes());

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'healthy',
      timestamp: expect.any(String),
    });
  });
});
