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

class CapturingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];

  send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
    return Promise.resolve();
  }

  lastFor(address: string, template?: string): EmailMessage | undefined {
    return [...this.sent]
      .reverse()
      .find(
        (message) =>
          message.to.toLowerCase() === address.toLowerCase() &&
          (template === undefined || message.template === template),
      );
  }

  clear(): void {
    this.sent.length = 0;
  }
}

const PASSWORD = 'the-original-passphrase';
const NEW_PASSWORD = 'a-brand-new-passphrase';

describe('Password recovery (e2e)', () => {
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

  const auth = (path: string): string => `${prefix}/v1/auth${path}`;

  async function createVerifiedAccount(email: string): Promise<void> {
    await request(server())
      .post(auth('/register'))
      .send({ email, password: PASSWORD, displayName: 'Recovery Test', preferredLocale: 'en' })
      .expect(202);

    const link = mail.lastFor(email, 'email-verification')?.variables.verificationUrl ?? '';
    const token = new URL(link).searchParams.get('token');

    await request(server()).post(auth('/verify-email')).send({ token }).expect(200);
    mail.clear();
  }

  /** Requests a reset and returns the token from the captured email. */
  async function requestResetToken(email: string): Promise<string> {
    await request(server()).post(auth('/forgot-password')).send({ email }).expect(202);

    const link = mail.lastFor(email, 'password-reset')?.variables.resetUrl ?? '';
    return new URL(link).searchParams.get('token') ?? '';
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

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'recovery-e2e' } } });
    await app?.close();
  });

  beforeEach(async () => {
    mail.clear();
    const keys = await redis.client.keys('{*}:*');
    if (keys.length > 0) await redis.client.del(...keys);
    address = `recovery-e2e-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.test`;
  });

  describe('requesting a reset', () => {
    it('sends a link to a known address', async () => {
      await createVerifiedAccount(address);
      await request(server()).post(auth('/forgot-password')).send({ email: address }).expect(202);

      expect(mail.lastFor(address, 'password-reset')).toBeDefined();
    });

    /**
     * This endpoint needs no credential, which makes it the easiest place in the
     * system to enumerate accounts. Known and unknown must be identical.
     */
    it('responds identically for an unknown address, and sends nothing', async () => {
      await createVerifiedAccount(address);

      const known = await request(server())
        .post(auth('/forgot-password'))
        .send({ email: address })
        .expect(202);

      mail.clear();

      const unknown = await request(server())
        .post(auth('/forgot-password'))
        .send({ email: 'recovery-e2e-nobody@example.test' })
        .expect(202);

      expect(unknown.status).toBe(known.status);
      expect(unknown.body).toEqual(known.body);
      expect(mail.sent).toHaveLength(0);
    });

    it('says nothing different for a suspended account', async () => {
      await createVerifiedAccount(address);
      await prisma.user.update({
        where: { emailNormalized: address },
        data: { status: 'SUSPENDED' },
      });
      mail.clear();

      await request(server()).post(auth('/forgot-password')).send({ email: address }).expect(202);

      // A suspended account must not be recoverable by its former holder;
      // lifting that is an administrative decision, not a self-service one.
      expect(mail.sent).toHaveLength(0);
    });

    it('caps requests per account, not merely per address', async () => {
      await createVerifiedAccount(address);

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(server()).post(auth('/forgot-password')).send({ email: address }).expect(202);
      }

      // Three permitted per hour; the rest are silently dropped so an attacker
      // cannot use the endpoint to flood one person's inbox.
      const resetEmails = mail.sent.filter((message) => message.template === 'password-reset');
      expect(resetEmails).toHaveLength(3);
    });

    it('stores only a digest of the reset token', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);

      const stored = await prisma.oneTimeToken.findFirst({
        where: { purpose: 'PASSWORD_RESET' },
        orderBy: { createdAt: 'desc' },
        select: { tokenHash: true },
      });

      expect(stored?.tokenHash).not.toBe(token);
      expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('completing a reset', () => {
    it('sets the new password and lets the user sign in with it', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      await request(server())
        .post(auth('/login'))
        .send({ email: address, password: NEW_PASSWORD })
        .expect(200);
    });

    it('makes the old password stop working', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      await request(server())
        .post(auth('/login'))
        .send({ email: address, password: PASSWORD })
        .expect(401);
    });

    /**
     * The reset is a response to a suspected compromise. Leaving the attacker's
     * session alive would make it theatre.
     */
    it('signs out every existing session', async () => {
      await createVerifiedAccount(address);

      const agent = request.agent(server());
      await agent.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);
      await agent.get(`${prefix}/v1/me`).expect(200);

      const token = await requestResetToken(address);
      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      await agent.get(`${prefix}/v1/me`).expect(401);
    });

    it('refuses a token a second time', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: 'yet-another-passphrase' })
        .expect(403);
    });

    it('refuses a fabricated token', async () => {
      await request(server())
        .post(auth('/reset-password'))
        .send({ token: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', newPassword: NEW_PASSWORD })
        .expect(403);
    });

    it('refuses a verification token used as a reset token', async () => {
      await request(server())
        .post(auth('/register'))
        .send({ email: address, password: PASSWORD, displayName: 'Cross', preferredLocale: 'en' })
        .expect(202);

      const link = mail.lastFor(address, 'email-verification')?.variables.verificationUrl ?? '';
      const verificationToken = new URL(link).searchParams.get('token');

      // Without the purpose check, anyone who can read a verification email
      // could set a new password on that account.
      await request(server())
        .post(auth('/reset-password'))
        .send({ token: verificationToken, newPassword: NEW_PASSWORD })
        .expect(403);
    });

    it('rejects a new password that fails the policy', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: 'short' })
        .expect(400);
    });

    it('clears the brute-force lock', async () => {
      await createVerifiedAccount(address);
      await prisma.user.update({
        where: { emailNormalized: address },
        data: { failedLoginCount: 9, lockedUntil: new Date(Date.now() + 900_000) },
      });

      const token = await requestResetToken(address);
      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      // Recovering an account must actually restore access to it.
      await request(server())
        .post(auth('/login'))
        .send({ email: address, password: NEW_PASSWORD })
        .expect(200);
    });

    it('tells the owner their password changed', async () => {
      await createVerifiedAccount(address);
      const token = await requestResetToken(address);
      mail.clear();

      await request(server())
        .post(auth('/reset-password'))
        .send({ token, newPassword: NEW_PASSWORD })
        .expect(200);

      // If the change was not theirs, this is how they find out in time.
      expect(mail.lastFor(address, 'password-changed')).toBeDefined();
    });
  });

  describe('changing a password while signed in', () => {
    it('requires the current password', async () => {
      await createVerifiedAccount(address);
      const agent = request.agent(server());
      await agent.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);

      // A session left open on a shared machine must not be enough to take the
      // account permanently.
      await agent
        .post(`${prefix}/v1/me/password`)
        .send({ currentPassword: 'not-the-current-one', newPassword: NEW_PASSWORD })
        .expect(401);
    });

    it('changes the password and keeps the current session alive', async () => {
      await createVerifiedAccount(address);
      const agent = request.agent(server());
      await agent.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);

      await agent
        .post(`${prefix}/v1/me/password`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      // The user is not signed out of the page they are looking at.
      await agent.get(`${prefix}/v1/me`).expect(200);
    });

    it('signs out other devices', async () => {
      await createVerifiedAccount(address);

      const desktop = request.agent(server());
      await desktop.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);

      const phone = request.agent(server());
      await phone.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);

      const response = await desktop
        .post(`${prefix}/v1/me/password`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(200);

      expect(response.body).toEqual({ revokedSessions: 1 });
      await phone.get(`${prefix}/v1/me`).expect(401);
    });

    it('refuses a new password identical to the current one', async () => {
      await createVerifiedAccount(address);
      const agent = request.agent(server());
      await agent.post(auth('/login')).send({ email: address, password: PASSWORD }).expect(200);

      await agent
        .post(`${prefix}/v1/me/password`)
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
        .expect(400);
    });

    it('requires authentication', async () => {
      await request(server())
        .post(`${prefix}/v1/me/password`)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
        .expect(401);
    });
  });
});
