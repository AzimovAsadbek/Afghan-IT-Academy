import { PERMISSIONS, ROLES, type CourseSummary } from '@afghan-it-academy/shared';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/index.js';
import { ENV, type Env } from '../src/config/index.js';
import { PrismaService } from '../src/infrastructure/prisma/index.js';
import { PasswordService, SessionService } from '../src/modules/identity/index.js';

/**
 * Catalogue read path against the real database.
 *
 * Depends on the seeded catalogue (`pnpm db:seed`), which is what CI runs before
 * this suite. The seed is convergent, so these tests do not mutate it.
 */
describe('Catalogue (e2e)', () => {
  let app: NestExpressApplication | undefined;
  let prisma: PrismaService;
  let sessions: SessionService;
  let passwords: PasswordService;
  let prefix = '';

  const PASSWORD = 'catalogue-e2e-passphrase-1';
  const context = { ipPrefix: null, userAgent: null, requestId: null };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    const env = app.get<Env>(ENV);
    configureApp(app, env);
    prefix = env.API_PREFIX;

    prisma = app.get(PrismaService);
    sessions = app.get(SessionService);
    passwords = app.get(PasswordService);

    await app.init();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { emailNormalized: { startsWith: 'catalogue-e2e' } } });
    await app?.close();
  });

  function server(): ReturnType<NestExpressApplication['getHttpServer']> {
    if (!app) throw new Error('Application was not initialised');
    return app.getHttpServer();
  }

  /** Narrows a supertest body once, so `.map` is not called on `any`. */
  function page(body: unknown): { items: CourseSummary[]; nextCursor: string | null } {
    return body as { items: CourseSummary[]; nextCursor: string | null };
  }

  function slugsOf(body: unknown): string[] {
    return page(body).items.map((course) => course.slug);
  }

  /** A signed-in user holding one role, for the permission-dependent cases. */
  async function signInAs(roleKey: string): Promise<string> {
    const email = `catalogue-e2e-${roleKey.toLowerCase()}-${String(Date.now())}@example.test`;

    const user = await prisma.user.create({
      data: {
        email,
        emailNormalized: email,
        displayName: 'Catalogue Tester',
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        passwordHash: await passwords.hash(PASSWORD),
      },
      select: { id: true },
    });

    const role = await prisma.role.findUniqueOrThrow({
      where: { key: roleKey },
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

    const issued = await sessions.create(user.id, context);
    return issued.accessToken;
  }

  describe('listing', () => {
    it('serves the catalogue without a session, because discovery is the front door', async () => {
      const response = await request(server()).get(`${prefix}/v1/courses`).expect(200);

      expect(page(response.body).items.length).toBeGreaterThan(0);
      expect(response.body).toHaveProperty('nextCursor');
    });

    it('omits unpublished courses from an anonymous listing', async () => {
      const response = await request(server()).get(`${prefix}/v1/courses`).expect(200);

      const slugs = slugsOf(response.body);
      expect(slugs).not.toContain('mobile-app-development');
    });

    /**
     * The permission, not the role, is what opens this up — a reviewer and an
     * instructor both hold it and neither is an administrator.
     */
    it('includes drafts for a caller holding course:view_unpublished', async () => {
      const token = await signInAs(ROLES.CONTENT_REVIEWER);

      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const slugs = slugsOf(response.body);
      expect(slugs).toContain('mobile-app-development');
    });

    it('does not include drafts for a signed-in learner', async () => {
      const token = await signInAs(ROLES.STUDENT);

      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const slugs = slugsOf(response.body);
      expect(slugs).not.toContain('mobile-app-development');
    });

    it('filters by subject', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'ENGLISH' })
        .expect(200);

      expect(page(response.body).items.length).toBeGreaterThan(0);
      for (const course of page(response.body).items) {
        expect(course.subject).toBe('ENGLISH');
      }
    });

    it('rejects an unknown subject rather than ignoring the filter', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'ASTROLOGY' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('rejects an unrecognised query parameter', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ orderBy: 'price' })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('paginates by cursor without repeating or skipping a course', async () => {
      const first = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ limit: 2 })
        .expect(200);

      expect(page(first.body).items).toHaveLength(2);
      expect(page(first.body).nextCursor).toEqual(expect.any(String));

      const second = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ limit: 2, cursor: page(first.body).nextCursor })
        .expect(200);

      const firstIds = page(first.body).items.map((course) => course.id);
      const secondIds = page(second.body).items.map((course) => course.id);

      expect(secondIds.some((id) => firstIds.includes(id))).toBe(false);
    });

    it('caps the page size so a caller cannot ask for the whole table', async () => {
      await request(server()).get(`${prefix}/v1/courses`).query({ limit: 500 }).expect(400);
    });
  });

  describe('localisation', () => {
    it('returns Dari text when Dari is requested', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', 'fa-AF')
        .expect(200);

      expect(response.body.textLocale).toBe('fa-AF');
      expect(response.body.title).toBe('مبانی توسعه‌ی وب');
    });

    /**
     * The seeded AI course has no Pashto translation, which is the normal state
     * of a multilingual catalogue mid-flight. An empty card would look like a
     * bug; falling back and saying so does not.
     */
    it('falls back to another locale and reports which one it used', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/introduction-to-artificial-intelligence`)
        .set('Accept-Language', 'ps-AF')
        .expect(200);

      expect(response.body.textLocale).not.toBe('ps-AF');
      expect(response.body.title.length).toBeGreaterThan(0);
    });

    it('falls back to the default locale when the header is absent', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .expect(200);

      expect(response.body.textLocale).toBe('fa-AF');
    });

    it('ignores an unsupported language rather than failing the request', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', 'uz-UZ')
        .expect(200);

      expect(response.body.textLocale).toBe('fa-AF');
    });
  });

  describe('detail', () => {
    it('returns the full description', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/databases-and-sql`)
        .set('Accept-Language', 'en')
        .expect(200);

      expect(response.body.description.length).toBeGreaterThan(0);
      expect(response.body.slug).toBe('databases-and-sql');
    });

    /**
     * A draft must be indistinguishable from a course that does not exist,
     * otherwise the endpoint confirms that an unannounced course is coming.
     */
    it('reports a draft as not found for an anonymous caller', async () => {
      const missing = await request(server())
        .get(`${prefix}/v1/courses/no-such-course-anywhere`)
        .expect(404);

      const draft = await request(server())
        .get(`${prefix}/v1/courses/mobile-app-development`)
        .expect(404);

      expect(draft.body.error.code).toBe(missing.body.error.code);
    });

    it('serves the draft to a caller holding course:view_unpublished', async () => {
      const token = await signInAs(ROLES.CONTENT_REVIEWER);

      const response = await request(server())
        .get(`${prefix}/v1/courses/mobile-app-development`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.slug).toBe('mobile-app-development');
    });

    it('rejects a malformed slug before it reaches the database', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/Not%20A%20Slug`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('exposure', () => {
    it('never leaks a draft course through the published listing', async () => {
      const response = await request(server()).get(`${prefix}/v1/courses`).expect(200);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toContain('DRAFT');
      expect(serialised).not.toContain('Still being written');
    });

    it('exposes the permission catalogue to nobody through this endpoint', async () => {
      const response = await request(server()).get(`${prefix}/v1/courses`).expect(200);

      expect(JSON.stringify(response.body)).not.toContain(PERMISSIONS.COURSE_VIEW_UNPUBLISHED);
    });
  });
});
