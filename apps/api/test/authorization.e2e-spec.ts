import { PERMISSIONS, ROLES } from '@afghan-it-academy/shared';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/index.js';
import { ENV, type Env } from '../src/config/index.js';
import { PrismaService } from '../src/infrastructure/prisma/index.js';
import { RedisService } from '../src/infrastructure/redis/index.js';
import { PasswordService, SessionService } from '../src/modules/identity/index.js';

const PASSWORD = 'authorization-suite-passphrase';

/**
 * Authentication and permission enforcement over HTTP.
 *
 * Exercises the guards as a request actually meets them: global by default,
 * opt-out via @Public(), permission keys rather than role names, ownership
 * checked against the actor rather than the URL.
 */
describe('Authorization (e2e)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService;
  let redis: RedisService;
  let sessions: SessionService;
  let passwords: PasswordService;
  let prefix = '';

  function server(): ReturnType<NestExpressApplication['getHttpServer']> {
    if (!app) throw new Error('Application was not initialised');
    return app.getHttpServer();
  }

  /** supertest types response bodies as `any`; this is the shape we read. */
  interface SessionRow {
    id: string;
    isCurrent: boolean;
  }

  /** Creates a verified account and returns an access-token cookie for it. */
  async function signedInUser(
    label: string,
    roleKeys: readonly string[] = [],
  ): Promise<{ userId: string; cookie: string }> {
    const address = `authz-e2e-${label}-${String(Date.now())}-${Math.random().toString(36).slice(2)}@example.test`;

    const user = await prisma.user.create({
      data: {
        email: address,
        emailNormalized: address,
        displayName: label,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        passwordHash: await passwords.hash(PASSWORD),
      },
      select: { id: true },
    });

    for (const key of roleKeys) {
      const role = await prisma.role.findUniqueOrThrow({ where: { key }, select: { id: true } });
      await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
    }

    const issued = await sessions.create(user.id, {
      ipPrefix: null,
      userAgent: 'vitest',
      requestId: 'authz-e2e',
    });

    return { userId: user.id, cookie: `aia_at=${issued.accessToken}` };
  }

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    const env = app.get<Env>(ENV);
    configureApp(app, env);
    prefix = env.API_PREFIX;

    await app.init();
    prisma = app.get(PrismaService);
    redis = app.get(RedisService);
    sessions = app.get(SessionService);
    passwords = app.get(PasswordService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'authz-e2e' } } });
    await app?.close();
  });

  beforeEach(async () => {
    const keys = await redis.client.keys('{*}:*');
    if (keys.length > 0) await redis.client.del(...keys);
  });

  describe('authentication is the default', () => {
    it('refuses an unauthenticated request to a guarded route', async () => {
      const response = await request(server()).get(`${prefix}/v1/me`).expect(401);
      expect(response.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('admits a request carrying a valid session cookie', async () => {
      const { cookie, userId } = await signedInUser('basic');

      const response = await request(server())
        .get(`${prefix}/v1/me`)
        .set('Cookie', [cookie])
        .expect(200);

      expect(response.body.id).toBe(userId);
    });

    it('refuses a fabricated token', async () => {
      await request(server())
        .get(`${prefix}/v1/me`)
        .set('Cookie', ['aia_at=not-a-real-token'])
        .expect(401);
    });

    it('refuses a token whose session has been revoked', async () => {
      const { cookie, userId } = await signedInUser('revoked');
      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [cookie]).expect(200);

      await sessions.revokeAllForUser(userId, 'ADMIN_REVOKED');

      // Revocation must bite on the very next request, not at token expiry.
      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [cookie]).expect(401);
    });

    it('leaves health probes anonymous', async () => {
      await request(server()).get(`${prefix}/health/live`).expect(200);
    });

    it('never exposes a password hash through /me', async () => {
      const { cookie } = await signedInUser('leak-check');

      const response = await request(server())
        .get(`${prefix}/v1/me`)
        .set('Cookie', [cookie])
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('$argon2');
      expect(response.body).not.toHaveProperty('passwordHash');
    });
  });

  describe('permission enforcement', () => {
    it('refuses a signed-in user who lacks the permission', async () => {
      const { cookie } = await signedInUser('student', [ROLES.STUDENT]);
      const victim = await signedInUser('victim');

      const response = await request(server())
        .post(`${prefix}/v1/admin/users/${victim.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.INSTRUCTOR })
        .expect(403);

      expect(response.body.error.code).toBe('FORBIDDEN');
      // The response must not disclose which permission would have worked.
      expect(JSON.stringify(response.body)).not.toContain(PERMISSIONS.USER_ASSIGN_ROLE);
    });

    it('refuses an ADMIN, who deliberately lacks user:assign_role', async () => {
      const { cookie } = await signedInUser('admin', [ROLES.ADMIN]);
      const victim = await signedInUser('admin-victim');

      // The capability that creates every other capability is reserved to
      // SUPER_ADMIN; an admin who can grant themselves any role is unconstrained.
      await request(server())
        .post(`${prefix}/v1/admin/users/${victim.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.SUPER_ADMIN })
        .expect(403);
    });

    it('admits a SUPER_ADMIN', async () => {
      const { cookie } = await signedInUser('super', [ROLES.SUPER_ADMIN]);
      const target = await signedInUser('grantee');

      const response = await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.INSTRUCTOR })
        .expect(200);

      expect(response.body).toEqual({ changed: true });
    });

    it('rejects an unknown role rather than storing it', async () => {
      const { cookie } = await signedInUser('super-bad-role', [ROLES.SUPER_ADMIN]);
      const target = await signedInUser('bad-role-target');

      await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: 'ROOT' })
        .expect(400);
    });

    it('audits a role grant', async () => {
      const { cookie, userId: granter } = await signedInUser('auditor', [ROLES.SUPER_ADMIN]);
      const target = await signedInUser('audited');

      await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.ANALYST })
        .expect(200);

      const entry = await prisma.auditLog.findFirst({
        where: { action: 'auth.role.granted', actorId: granter, entityId: target.userId },
      });

      expect(entry).not.toBeNull();
      expect(entry?.metadata).toMatchObject({ role: ROLES.ANALYST });
    });
  });

  describe('permission cache invalidation', () => {
    /**
     * The cache exists so authorization does not run a three-table join per
     * request. Its TTL must never be the thing that decides when a revocation
     * takes effect — that would hand back the staleness opaque sessions were
     * chosen to avoid.
     */
    it('applies a granted role on the very next request', async () => {
      const { cookie, userId } = await signedInUser('promotee');
      const target = await signedInUser('promotee-target');
      const superAdmin = await signedInUser('promoter', [ROLES.SUPER_ADMIN]);

      // Populates the cache with the unprivileged permission set.
      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [cookie]).expect(200);

      await request(server())
        .post(`${prefix}/v1/admin/users/${userId}/roles`)
        .set('Cookie', [superAdmin.cookie])
        .send({ role: ROLES.SUPER_ADMIN })
        .expect(200);

      // No waiting for a TTL.
      await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.ANALYST })
        .expect(200);
    });

    it('applies a revoked role on the very next request', async () => {
      const { cookie, userId } = await signedInUser('demotee', [ROLES.SUPER_ADMIN]);
      const target = await signedInUser('demotee-target');

      await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.ANALYST })
        .expect(200);

      const superAdmin = await signedInUser('demoter', [ROLES.SUPER_ADMIN]);
      await request(server())
        .delete(`${prefix}/v1/admin/users/${userId}/roles/${ROLES.SUPER_ADMIN}`)
        .set('Cookie', [superAdmin.cookie])
        .expect(200);

      await request(server())
        .post(`${prefix}/v1/admin/users/${target.userId}/roles`)
        .set('Cookie', [cookie])
        .send({ role: ROLES.INSTRUCTOR })
        .expect(403);
    });

    it('reports roles and permissions through /me', async () => {
      const { cookie } = await signedInUser('finance', [ROLES.FINANCE_MANAGER]);

      const response = await request(server())
        .get(`${prefix}/v1/me`)
        .set('Cookie', [cookie])
        .expect(200);

      expect(response.body.roles).toContain(ROLES.FINANCE_MANAGER);
      expect(response.body.permissions).toContain(PERMISSIONS.PAYMENT_REFUND);
      // Finance sees payments, not study histories.
      expect(response.body.permissions).not.toContain(PERMISSIONS.STUDENT_VIEW);
    });
  });

  describe('session ownership', () => {
    it('lists only the requester’s own sessions', async () => {
      const owner = await signedInUser('owner');
      await signedInUser('stranger');

      const response = await request(server())
        .get(`${prefix}/v1/me/sessions`)
        .set('Cookie', [owner.cookie])
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].isCurrent).toBe(true);
    });

    /** IDOR: a session id in a URL proves nothing about who owns it. */
    it('refuses to revoke another user’s session', async () => {
      const owner = await signedInUser('idor-owner');
      const attacker = await signedInUser('idor-attacker');

      const listed = await request(server())
        .get(`${prefix}/v1/me/sessions`)
        .set('Cookie', [owner.cookie])
        .expect(200);

      const [victimSession] = listed.body as SessionRow[];
      const victimSessionId = victimSession?.id ?? '';

      await request(server())
        .delete(`${prefix}/v1/me/sessions/${victimSessionId}`)
        .set('Cookie', [attacker.cookie])
        .expect(404);

      // And the victim is still signed in.
      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [owner.cookie]).expect(200);
    });

    it('revokes the requester’s own session', async () => {
      const owner = await signedInUser('self-revoke');

      const listed = await request(server())
        .get(`${prefix}/v1/me/sessions`)
        .set('Cookie', [owner.cookie])
        .expect(200);

      const [ownSession] = listed.body as SessionRow[];

      await request(server())
        .delete(`${prefix}/v1/me/sessions/${ownSession?.id ?? ''}`)
        .set('Cookie', [owner.cookie])
        .expect(204);

      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [owner.cookie]).expect(401);
    });

    it('signs out other devices but keeps the current one', async () => {
      const owner = await signedInUser('multi-device');
      await sessions.create(owner.userId, {
        ipPrefix: null,
        userAgent: 'phone',
        requestId: 'authz-e2e',
      });

      const response = await request(server())
        .post(`${prefix}/v1/me/sessions/revoke-others`)
        .set('Cookie', [owner.cookie])
        .expect(200);

      expect(response.body).toEqual({ revoked: 1 });
      await request(server()).get(`${prefix}/v1/me`).set('Cookie', [owner.cookie]).expect(200);
    });
  });
});
