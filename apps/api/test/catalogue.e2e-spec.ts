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

  const PASSWORD = 'catalogue-suite-passphrase';
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

    /**
     * The header every real browser sends. This endpoint once matched the first
     * tag exactly and served Dari to every English speaker, so it is pinned at
     * the API boundary and not only in the resolver's own unit tests.
     */
    it.each([
      ['en-US,en;q=0.9', 'en'],
      ['en-GB', 'en'],
      ['fa-IR,fa;q=0.9', 'fa-AF'],
      ['ps-PK', 'ps-AF'],
    ])('resolves %s to %s', async (header, expected) => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', header)
        .expect(200);

      expect((response.body as { textLocale: string }).textLocale).toBe(expected);
    });

    it('honours quality values rather than taking the first tag', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', 'en;q=0.2,ps-AF;q=0.9')
        .expect(200);

      expect((response.body as { textLocale: string }).textLocale).toBe('ps-AF');
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

  /**
   * Creates a fixture course.
   *
   * Fixtures live in the tests rather than in the shared seed on purpose. The
   * seed is representative catalogue content that every developer and any demo
   * environment sees; an archived sample and four courses with hand-picked
   * timestamps are neither. A test that needs peculiar data should own it and
   * clean it up.
   *
   * Every fixture is `subject: AI, level: ADVANCED` — a combination the seed
   * does not use, so `?subject=AI&level=ADVANCED` isolates exactly this block's
   * rows and the assertions do not shift when the seed gains a course.
   */
  async function makeCourse(input: {
    slug: string;
    status: 'DRAFT' | 'IN_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
    publishedAt?: Date | null;
  }): Promise<void> {
    const subject = await prisma.subject.findUniqueOrThrow({
      where: { key: 'AI' },
      select: { id: true },
    });

    await prisma.course.create({
      data: {
        slug: input.slug,
        subjectId: subject.id,
        level: 'ADVANCED',
        status: input.status,
        publishedAt: input.publishedAt ?? null,
        estimatedMinutes: 60,
        translations: {
          create: [{ locale: 'en', title: input.slug, summary: 's', description: 'd' }],
        },
      },
      select: { id: true },
    });
  }

  async function dropCourses(slugs: readonly string[]): Promise<void> {
    await prisma.course.deleteMany({ where: { slug: { in: [...slugs] } } });
  }

  /** Only this block's fixtures, in the API's compound order. */
  async function fixtureSlugs(token?: string): Promise<string[]> {
    const call = request(server())
      .get(`${prefix}/v1/courses`)
      .query({ subject: 'AI', level: 'ADVANCED', limit: 20 });

    if (token !== undefined) call.set('Authorization', `Bearer ${token}`);

    const response = await call.expect(200);
    return slugsOf(response.body);
  }

  describe('status visibility', () => {
    const SLUGS = [
      'fixture-status-published',
      'fixture-status-draft',
      'fixture-status-in-review',
      'fixture-status-archived',
    ];

    beforeAll(async () => {
      await dropCourses(SLUGS);
      await makeCourse({
        slug: 'fixture-status-published',
        status: 'PUBLISHED',
        publishedAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      await makeCourse({ slug: 'fixture-status-draft', status: 'DRAFT' });
      await makeCourse({ slug: 'fixture-status-in-review', status: 'IN_REVIEW' });
      await makeCourse({
        slug: 'fixture-status-archived',
        status: 'ARCHIVED',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
    });

    afterAll(async () => {
      await dropCourses(SLUGS);
    });

    it('shows a learner published courses and nothing else', async () => {
      expect(await fixtureSlugs()).toEqual(['fixture-status-published']);
    });

    it.each([
      ['fixture-status-draft', 404],
      ['fixture-status-in-review', 404],
      ['fixture-status-published', 200],
      // Archived stays reachable by slug so a link in an old certificate or a
      // shared message keeps resolving, even though it is no longer on offer.
      ['fixture-status-archived', 200],
    ])('serves %s as %i to an anonymous caller', async (slug, status) => {
      await request(server()).get(`${prefix}/v1/courses/${slug}`).expect(status);
    });

    /**
     * Documented current behaviour, pinned so a change is deliberate: a holder
     * of course:view_unpublished sees drafts and in-review in the listing, but
     * archived courses are excluded from listings for everyone. Managing
     * archived content is an instructor-platform concern that does not exist
     * yet.
     */
    it('shows a privileged caller everything except archived, in the listing', async () => {
      const token = await signInAs(ROLES.CONTENT_REVIEWER);
      const slugs = await fixtureSlugs(token);

      expect(slugs).toContain('fixture-status-published');
      expect(slugs).toContain('fixture-status-draft');
      expect(slugs).toContain('fixture-status-in-review');
      expect(slugs).not.toContain('fixture-status-archived');
    });

    it('serves every status by slug to a privileged caller', async () => {
      const token = await signInAs(ROLES.CONTENT_REVIEWER);

      for (const slug of SLUGS) {
        await request(server())
          .get(`${prefix}/v1/courses/${slug}`)
          .set('Authorization', `Bearer ${token}`)
          .expect(200);
      }
    });
  });

  /**
   * The seeded catalogue gives every published course the same `publishedAt`,
   * so ordering there rests entirely on the id tiebreaker and a compound-key
   * bug would go unnoticed. These fixtures deliberately pair two courses on one
   * timestamp and two on another, so paging has to cross a `publishedAt`
   * boundary *and* resolve a tie within it.
   */
  describe('compound cursor pagination', () => {
    const NEWER = new Date('2026-07-02T00:00:00.000Z');
    const OLDER = new Date('2026-07-01T00:00:00.000Z');
    const SLUGS = ['fixture-page-a', 'fixture-page-b', 'fixture-page-c', 'fixture-page-d'];

    beforeAll(async () => {
      await dropCourses(SLUGS);
      await makeCourse({ slug: 'fixture-page-a', status: 'PUBLISHED', publishedAt: NEWER });
      await makeCourse({ slug: 'fixture-page-b', status: 'PUBLISHED', publishedAt: NEWER });
      await makeCourse({ slug: 'fixture-page-c', status: 'PUBLISHED', publishedAt: OLDER });
      await makeCourse({ slug: 'fixture-page-d', status: 'PUBLISHED', publishedAt: OLDER });
    });

    afterAll(async () => {
      await dropCourses(SLUGS);
    });

    /** Walks every page of the isolated fixture set at a given page size. */
    async function walk(limit: number): Promise<string[]> {
      const seen: string[] = [];
      let cursor: string | null = null;

      for (let guard = 0; guard < 20; guard += 1) {
        const query: Record<string, string | number> = {
          subject: 'AI',
          level: 'ADVANCED',
          limit,
        };
        if (cursor !== null) query.cursor = cursor;

        const response = await request(server())
          .get(`${prefix}/v1/courses`)
          .query(query)
          .expect(200);

        const body = page(response.body);
        seen.push(...body.items.map((course) => course.slug));

        cursor = body.nextCursor;
        if (cursor === null) return seen;
      }

      throw new Error('Pagination did not terminate');
    }

    it('returns the full set exactly once at every page size', async () => {
      for (const limit of [1, 2, 3, 4]) {
        const seen = await walk(limit);

        expect(new Set(seen).size, `duplicates at limit=${String(limit)}`).toBe(seen.length);
        expect([...seen].sort(), `missing rows at limit=${String(limit)}`).toEqual(
          [...SLUGS].sort(),
        );
      }
    });

    it('orders by publishedAt then id, both descending', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'AI', level: 'ADVANCED', limit: 20 })
        .expect(200);

      const items = page(response.body).items;

      // The two newer courses come first as a pair, whichever way the id tie
      // resolves; the older pair follows.
      expect(
        items
          .slice(0, 2)
          .map((course) => course.slug)
          .sort(),
      ).toEqual(['fixture-page-a', 'fixture-page-b']);
      expect(
        items
          .slice(2, 4)
          .map((course) => course.slug)
          .sort(),
      ).toEqual(['fixture-page-c', 'fixture-page-d']);

      for (let i = 1; i < items.length; i += 1) {
        const previous = items[i - 1];
        const current = items[i];
        if (!previous || !current) throw new Error('unexpected gap');

        const earlier = previous.publishedAt ?? '';
        const later = current.publishedAt ?? '';

        // Non-increasing by publishedAt; id strictly decreasing within a tie.
        expect(earlier >= later).toBe(true);
        if (earlier === later) expect(previous.id > current.id).toBe(true);
      }
    });

    it('resumes exactly after the cursor row rather than restarting', async () => {
      const first = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'AI', level: 'ADVANCED', limit: 1 })
        .expect(200);

      const firstSlug = page(first.body).items[0]?.slug;
      const cursor = page(first.body).nextCursor;
      expect(cursor).toEqual(expect.any(String));

      const second = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'AI', level: 'ADVANCED', limit: 1, cursor })
        .expect(200);

      expect(page(second.body).items[0]?.slug).not.toBe(firstSlug);
    });

    it('terminates with a null cursor on the last page', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .query({ subject: 'AI', level: 'ADVANCED', limit: 4 })
        .expect(200);

      expect(page(response.body).items).toHaveLength(4);
      expect(page(response.body).nextCursor).toBeNull();
    });
  });

  describe('caching', () => {
    /**
     * The response body is chosen by Accept-Language, so a shared cache has to
     * know that. Without this a CDN serves whichever locale it saw first to
     * everyone — and the origin looks perfectly correct while it happens.
     */
    it('declares that the response varies by Accept-Language', async () => {
      const response = await request(server()).get(`${prefix}/v1/courses`).expect(200);

      const vary = (response.headers.vary ?? '').toLowerCase();
      expect(vary).toContain('accept-language');
    });

    it('keeps the Vary values CORS and compression added', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses`)
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      const vary = (response.headers.vary ?? '').toLowerCase();
      expect(vary).toContain('origin');
      expect(vary).toContain('accept-encoding');
      expect(vary).toContain('accept-language');
    });

    it('declares Vary on a 404 too, so a miss cannot be cached across locales', async () => {
      const response = await request(server())
        .get(`${prefix}/v1/courses/no-such-course-at-all`)
        .expect(404);

      expect((response.headers.vary ?? '').toLowerCase()).toContain('accept-language');
    });

    it('gives each locale a distinct ETag for the same URL', async () => {
      const tags = new Set<string>();

      for (const locale of ['en', 'fa-AF', 'ps-AF']) {
        const response = await request(server())
          .get(`${prefix}/v1/courses/web-development-foundations`)
          .set('Accept-Language', locale)
          .expect(200);

        tags.add(String(response.headers.etag));
      }

      expect(tags.size).toBe(3);
    });

    it('does not answer 304 when the cached copy is a different locale', async () => {
      const english = await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', 'en')
        .expect(200);

      await request(server())
        .get(`${prefix}/v1/courses/web-development-foundations`)
        .set('Accept-Language', 'fa-AF')
        .set('If-None-Match', String(english.headers.etag))
        .expect(200);
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
