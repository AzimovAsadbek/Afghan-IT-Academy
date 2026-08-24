import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/index.js';
import { ENV, type Env } from '../src/config/index.js';
import { PrismaService } from '../src/infrastructure/prisma/index.js';
import { RedisService } from '../src/infrastructure/redis/index.js';
import {
  EMAIL_SENDER,
  type EmailMessage,
  type EmailSender,
} from '../src/modules/notifications/index.js';

/**
 * Collects outbound mail instead of delivering it.
 *
 * Overriding the port rather than reading the development logger is the point
 * of having a port: the test reads the verification link the same way a real
 * provider would receive it, and the token never has to be reversed out of its
 * stored digest — which is impossible, and correctly so.
 */
class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastFor(address: string): EmailMessage | undefined {
    return [...this.sent]
      .reverse()
      .find((message) => message.to.toLowerCase() === address.toLowerCase());
  }

  clear(): void {
    this.sent.length = 0;
  }
}

const PASSWORD = 'a-perfectly-good-passphrase';

describe('Authentication (e2e)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService;
  let redis: RedisService;
  let mail: CapturingEmailSender;
  let prefix = '';
  let address = '';

  function server(): ReturnType<NestExpressApplication['getHttpServer']> {
    if (!app) throw new Error('Application was not initialised');
    return app.getHttpServer();
  }

  const url = (path: string): string => `${prefix}/v1/auth${path}`;

  /** Registers, verifies, and returns the address. */
  async function registerAndVerify(email: string): Promise<void> {
    await request(server())
      .post(url('/register'))
      .send({ email, password: PASSWORD, displayName: 'Test Learner', preferredLocale: 'fa-AF' })
      .expect(202);

    const message = mail.lastFor(email);
    const token = new URL(message?.variables.verificationUrl ?? '').searchParams.get('token');

    await request(server()).post(url('/verify-email')).send({ token }).expect(200);
  }

  beforeAll(async () => {
    mail = new CapturingEmailSender();

    const moduleRef: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMAIL_SENDER)
      .useValue(mail)
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    const env = app.get<Env>(ENV);
    configureApp(app, env);
    prefix = env.API_PREFIX;

    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
  });

  /**
   * Clears throttle counters between tests.
   *
   * Every request in this suite arrives from 127.0.0.1, so the per-address
   * limits — which are doing exactly what they should in production — would
   * otherwise exhaust after the fifth registration and fail the rest of the
   * file. The limits themselves are asserted deliberately in their own test
   * below rather than being weakened for the suite.
   */
  async function resetRateLimits(): Promise<void> {
    const keys = await redis.client.keys('{*}:*');
    if (keys.length > 0) await redis.client.del(...keys);
  }

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'auth-e2e' } } });
    await app?.close();
  });

  beforeEach(async () => {
    mail.clear();
    await resetRateLimits();
    address = `auth-e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.test`;
  });

  describe('registration', () => {
    it('accepts a new account and sends a verification link', async () => {
      const response = await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: PASSWORD,
          displayName: 'New Learner',
          preferredLocale: 'en',
        })
        .expect(202);

      expect(response.body).toEqual({ status: 'verification_sent' });
      expect(mail.lastFor(address)?.template).toBe('email-verification');
    });

    it('creates the account pending verification, with the default role', async () => {
      await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: PASSWORD,
          displayName: 'New Learner',
          preferredLocale: 'en',
        })
        .expect(202);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: address },
        select: {
          status: true,
          emailVerifiedAt: true,
          roles: { select: { role: { select: { key: true } } } },
        },
      });

      expect(user.status).toBe('PENDING_VERIFICATION');
      expect(user.emailVerifiedAt).toBeNull();
      expect(user.roles.map((assignment) => assignment.role.key)).toEqual(['STUDENT']);
    });

    /**
     * The whole anti-enumeration property in one test: a taken address and a
     * free one must be indistinguishable from the response.
     */
    it('responds identically for an address that already exists', async () => {
      const first = await request(server())
        .post(url('/register'))
        .send({ email: address, password: PASSWORD, displayName: 'First', preferredLocale: 'en' })
        .expect(202);

      mail.clear();

      const second = await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: 'a-completely-different-one',
          displayName: 'Second',
          preferredLocale: 'en',
        })
        .expect(202);

      expect(second.status).toBe(first.status);
      expect(second.body).toEqual(first.body);
      // And the existing owner is not emailed, so registration cannot be used
      // to flood someone's inbox either.
      expect(mail.sent).toHaveLength(0);
    });

    it('does not overwrite the existing account', async () => {
      await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: PASSWORD,
          displayName: 'Original',
          preferredLocale: 'en',
        })
        .expect(202);

      await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: 'attacker-chosen-password',
          displayName: 'Replaced',
          preferredLocale: 'en',
        })
        .expect(202);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: address },
        select: { displayName: true },
      });
      expect(user.displayName).toBe('Original');
    });

    it('treats addresses case-insensitively', async () => {
      await request(server())
        .post(url('/register'))
        .send({
          email: address.toUpperCase(),
          password: PASSWORD,
          displayName: 'Upper',
          preferredLocale: 'en',
        })
        .expect(202);

      expect(await prisma.user.count({ where: { emailNormalized: address } })).toBe(1);
    });

    it('rejects a weak password', async () => {
      const response = await request(server())
        .post(url('/register'))
        .send({ email: address, password: 'short', displayName: 'New', preferredLocale: 'en' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an unexpected field rather than ignoring it', async () => {
      // Silently dropping { status: 'ACTIVE' } would hide both client bugs and
      // probing for mass-assignment.
      await request(server())
        .post(url('/register'))
        .send({
          email: address,
          password: PASSWORD,
          displayName: 'New',
          preferredLocale: 'en',
          status: 'ACTIVE',
        })
        .expect(400);
    });
  });

  describe('email verification', () => {
    it('activates the account', async () => {
      await registerAndVerify(address);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: address },
        select: { status: true, emailVerifiedAt: true },
      });

      expect(user.status).toBe('ACTIVE');
      expect(user.emailVerifiedAt).not.toBeNull();
    });

    it('refuses a token a second time', async () => {
      await request(server())
        .post(url('/register'))
        .send({ email: address, password: PASSWORD, displayName: 'New', preferredLocale: 'en' })
        .expect(202);

      const link = mail.lastFor(address)?.variables.verificationUrl ?? '';
      const token = new URL(link).searchParams.get('token');

      await request(server()).post(url('/verify-email')).send({ token }).expect(200);
      await request(server()).post(url('/verify-email')).send({ token }).expect(403);
    });

    it('refuses a fabricated token', async () => {
      await request(server())
        .post(url('/verify-email'))
        .send({ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' })
        .expect(403);
    });

    it('stays silent when resending for an unknown address', async () => {
      const response = await request(server())
        .post(url('/resend-verification'))
        .send({ email: 'auth-e2e-nobody@example.test' })
        .expect(202);

      expect(response.body).toEqual({ status: 'verification_sent' });
      expect(mail.sent).toHaveLength(0);
    });
  });

  describe('sign in', () => {
    it('refuses before the address is verified', async () => {
      await request(server())
        .post(url('/register'))
        .send({ email: address, password: PASSWORD, displayName: 'New', preferredLocale: 'en' })
        .expect(202);

      const response = await request(server())
        .post(url('/login'))
        .send({ email: address, password: PASSWORD })
        .expect(403);

      expect(response.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('issues httpOnly session cookies once verified', async () => {
      await registerAndVerify(address);

      const response = await request(server())
        .post(url('/login'))
        .send({ email: address, password: PASSWORD })
        .expect(200);

      const cookies = response.headers['set-cookie'] as unknown as string[];
      const access = cookies.find((cookie) => cookie.startsWith('aia_at='));
      const refresh = cookies.find((cookie) => cookie.startsWith('aia_rt='));

      expect(access).toContain('HttpOnly');
      expect(refresh).toContain('HttpOnly');
      // Scoped away from ordinary traffic.
      expect(refresh).toContain('Path=/api/v1/auth');
      expect(refresh).toContain('SameSite=Strict');
    });

    it('returns the same failure for a wrong password and an unknown account', async () => {
      await registerAndVerify(address);

      const wrongPassword = await request(server())
        .post(url('/login'))
        .send({ email: address, password: 'not-the-right-password' })
        .expect(401);

      const unknownAccount = await request(server())
        .post(url('/login'))
        .send({ email: 'auth-e2e-ghost@example.test', password: PASSWORD })
        .expect(401);

      expect(unknownAccount.body.error.code).toBe(wrongPassword.body.error.code);
      expect(unknownAccount.body.error.message).toBe(wrongPassword.body.error.message);
    });

    it('never returns a password hash', async () => {
      await registerAndVerify(address);

      const response = await request(server())
        .post(url('/login'))
        .send({ email: address, password: PASSWORD })
        .expect(200);

      const serialised = JSON.stringify(response.body) + JSON.stringify(response.headers);
      expect(serialised).not.toContain('$argon2');
      expect(serialised).not.toContain('passwordHash');
    });

    it('records the sign-in in the audit log', async () => {
      await registerAndVerify(address);
      await request(server())
        .post(url('/login'))
        .send({ email: address, password: PASSWORD })
        .expect(200);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: address },
        select: { id: true },
      });

      const entry = await prisma.auditLog.findFirst({
        where: { actorId: user.id, action: 'auth.login.succeeded' },
      });
      expect(entry).not.toBeNull();
    });

    it('records a failed attempt too', async () => {
      await registerAndVerify(address);
      await request(server())
        .post(url('/login'))
        .send({ email: address, password: 'wrong-password-here' })
        .expect(401);

      const user = await prisma.user.findUniqueOrThrow({
        where: { emailNormalized: address },
        select: { id: true, failedLoginCount: true },
      });

      expect(user.failedLoginCount).toBe(1);
      expect(
        await prisma.auditLog.count({ where: { actorId: user.id, action: 'auth.login.failed' } }),
      ).toBe(1);
    });
  });

  describe('refresh and logout', () => {
    it('rotates the session and keeps the user signed in', async () => {
      await registerAndVerify(address);
      const agent = request.agent(server());

      await agent.post(url('/login')).send({ email: address, password: PASSWORD }).expect(200);
      const refreshed = await agent.post(url('/refresh')).send({}).expect(200);

      expect(refreshed.body).toEqual({ status: 'refreshed' });
      expect(refreshed.headers['set-cookie']).toBeDefined();
    });

    it('rejects a refresh with no token', async () => {
      await request(server()).post(url('/refresh')).send({}).expect(401);
    });

    it('clears cookies when the refresh token is rejected', async () => {
      const response = await request(server())
        .post(url('/refresh'))
        .set('Cookie', ['aia_rt=a-token-that-was-never-issued'])
        .send({})
        .expect(401);

      const cookies = (response.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
      // A browser holding a dead token must stop replaying it on every load.
      expect(cookies.some((cookie) => cookie.startsWith('aia_rt=;'))).toBe(true);
    });

    it('ends the session on logout', async () => {
      await registerAndVerify(address);
      const agent = request.agent(server());

      await agent.post(url('/login')).send({ email: address, password: PASSWORD }).expect(200);
      await agent.post(url('/logout')).send({}).expect(200);

      // The refresh token is dead, so the session cannot be resurrected.
      await agent.post(url('/refresh')).send({}).expect(401);
    });

    it('signs out cleanly even with no session', async () => {
      const response = await request(server()).post(url('/logout')).send({}).expect(200);
      expect(response.body).toEqual({ status: 'signed_out' });
    });
  });

  describe('rate limiting', () => {
    /**
     * Credential stuffing is the attack this exists to stop. Six attempts
     * against one address must not all be answered.
     */
    it('stops repeated sign-in attempts from one address', async () => {
      await registerAndVerify(address);
      await resetRateLimits();

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await request(server())
          .post(url('/login'))
          .send({ email: address, password: 'wrong-password-attempt' });
        statuses.push(response.status);
      }

      expect(statuses).toContain(429);
      // The limit is 5, so the sixth attempt onwards is refused.
      expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(2);
    });

    it('limits registration attempts', async () => {
      await resetRateLimits();

      const statuses: number[] = [];
      for (let attempt = 0; attempt < 7; attempt += 1) {
        const response = await request(server())
          .post(url('/register'))
          .send({
            email: `auth-e2e-flood-${String(attempt)}-${String(Date.now())}@example.test`,
            password: PASSWORD,
            displayName: 'Flood',
            preferredLocale: 'en',
          });
        statuses.push(response.status);
      }

      expect(statuses).toContain(429);
    });

    it('returns the standard error envelope when throttled', async () => {
      await resetRateLimits();

      let throttled: request.Response | undefined;
      for (let attempt = 0; attempt < 8 && !throttled; attempt += 1) {
        const response = await request(server())
          .post(url('/login'))
          .send({ email: 'auth-e2e-throttle@example.test', password: 'whatever-goes-here' });
        if (response.status === 429) throttled = response;
      }

      expect(throttled?.body.error.code).toBe('RATE_LIMITED');
      expect(throttled?.body.error.requestId).toEqual(expect.any(String));
    });
  });
});
