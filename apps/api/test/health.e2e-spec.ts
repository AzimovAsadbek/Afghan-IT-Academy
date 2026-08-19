import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/index.js';
import { REQUEST_ID_HEADER } from '../src/common/index.js';
import { ENV, type Env } from '../src/config/index.js';

/**
 * Boots the real application against the Postgres and Redis containers from
 * docker-compose, using the same `configureApp` the production entrypoint uses.
 *
 *   pnpm db:up
 *   pnpm --filter @afghan-it-academy/api test:e2e
 */
describe('Health (e2e)', () => {
  let app: NestExpressApplication | undefined;
  let prefix = '';

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    const env = app.get<Env>(ENV);
    configureApp(app, env);
    prefix = env.API_PREFIX;

    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Narrows the module-scoped `app` once, instead of at every call site. */
  function server(): ReturnType<NestExpressApplication['getHttpServer']> {
    if (!app) throw new Error('Application was not initialised');
    return app.getHttpServer();
  }

  it('serves liveness outside the version prefix so probe URLs never move', async () => {
    const response = await request(server()).get(`${prefix}/health/live`).expect(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports readiness with per-dependency status', async () => {
    const response = await request(server()).get(`${prefix}/health/ready`).expect(200);

    expect(response.body).toMatchObject({
      status: 'ready',
      checks: { database: { status: 'up' }, cache: { status: 'up' } },
    });
  });

  it('echoes a well-formed inbound request id', async () => {
    const response = await request(server())
      .get(`${prefix}/health/live`)
      .set(REQUEST_ID_HEADER, 'trace-abc-123')
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]).toBe('trace-abc-123');
  });

  it('replaces a malformed inbound request id instead of reflecting it', async () => {
    const response = await request(server())
      .get(`${prefix}/health/live`)
      .set(REQUEST_ID_HEADER, 'attacker id <script>')
      .expect(200);

    const echoed = response.headers[REQUEST_ID_HEADER]!;
    expect(echoed).not.toContain('script');
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('replaces an over-long inbound request id', async () => {
    const response = await request(server())
      .get(`${prefix}/health/live`)
      .set(REQUEST_ID_HEADER, 'a'.repeat(500))
      .expect(200);

    expect(response.headers[REQUEST_ID_HEADER]!).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns the standard error envelope for an unknown route', async () => {
    const response = await request(server()).get(`${prefix}/v1/does-not-exist`).expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        requestId: expect.any(String) as unknown,
        timestamp: expect.any(String) as unknown,
      },
    });
  });

  it('applies hardening headers to every response', async () => {
    const response = await request(server()).get(`${prefix}/health/live`).expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    // Must not advertise the framework.
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects a cross-origin request from an origin that is not allow-listed', async () => {
    const response = await request(server())
      .get(`${prefix}/health/live`)
      .set('Origin', 'https://attacker.example')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
