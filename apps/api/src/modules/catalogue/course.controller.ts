import {
  ERROR_CODES,
  PERMISSIONS,
  resolveLocale,
  type CourseDetail,
  type Locale,
} from '@afghan-it-academy/shared';
import { Controller, Get, HttpStatus, Param, Query, Req, UseInterceptors } from '@nestjs/common';
import type { Request } from 'express';

import {
  DomainException,
  Public,
  VaryInterceptor,
  ZodValidationPipe,
  type AuthenticatedActor,
  type RequestWithActor,
} from '../../common/index.js';
import {
  courseListQuerySchema,
  courseSlugSchema,
  type CourseListQueryInput,
} from './course.dto.js';
import { CourseService, type CoursePage } from './course.service.js';

/**
 * The public catalogue.
 *
 * `@Public()` because discovery is the front door: a learner has to be able to
 * see what is on offer before deciding whether to create an account. The guard
 * still runs and still attaches an actor when a session is present, which is
 * what lets the same endpoint show an instructor their unpublished drafts
 * without a second route.
 */
@Public()
/* Course text is chosen by Accept-Language, so every response here depends on
 * it. Declaring that keeps a shared cache from serving one locale's copy to
 * everyone. */
@UseInterceptors(new VaryInterceptor('Accept-Language'))
@Controller({ path: 'courses', version: '1' })
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(courseListQuerySchema)) query: CourseListQueryInput,
    @Req() request: Request,
  ): Promise<CoursePage> {
    return this.courses.list({
      locale: this.localeOf(request),
      limit: query.limit,
      includeUnpublished: this.mayViewUnpublished(request),
      ...(query.cursor ? { cursor: query.cursor } : {}),
      ...(query.subject ? { subject: query.subject } : {}),
      ...(query.level ? { level: query.level } : {}),
    });
  }

  @Get(':slug')
  async detail(
    @Param('slug', new ZodValidationPipe(courseSlugSchema)) slug: string,
    @Req() request: Request,
  ): Promise<CourseDetail> {
    const course = await this.courses.findBySlug(
      slug,
      this.localeOf(request),
      this.mayViewUnpublished(request),
    );

    if (!course) {
      // The same 404 for "no such course" and "not published, and you may not
      // see drafts". Distinguishing them would let anyone discover that an
      // unannounced course exists.
      throw new DomainException(ERROR_CODES.NOT_FOUND, HttpStatus.NOT_FOUND, 'No such course.');
    }

    return course;
  }

  /**
   * Which language to return course text in.
   *
   * Delegates to the shared `resolveLocale`, which already ranks by q-value and
   * falls back through the tag hierarchy — `en-US` to `en`, `fa-IR` to `fa-AF`.
   *
   * An earlier version of this method matched the first tag exactly, on the
   * assumption that the only caller would be our own web app sending a single
   * locale. That assumption was wrong twice over: it is untestable until the
   * client exists, and it is false for every crawler and non-app consumer, all
   * of which send `en-US,en;q=0.9` and were quietly served Dari.
   *
   * An unrecognised or absent header still falls back to the default rather
   * than erroring: a missing header is an ordinary request, not a client
   * mistake worth rejecting.
   */
  private localeOf(request: Request): Locale {
    const header = request.headers['accept-language'];
    return resolveLocale(typeof header === 'string' ? header : null);
  }

  /**
   * Whether this caller may see unpublished courses.
   *
   * Read from the actor the global guard already resolved. Anonymous callers
   * have no actor, so they get the published catalogue — the check is a
   * permission lookup, never a trust in anything the client sent.
   */
  private mayViewUnpublished(request: Request): boolean {
    const { actor } = request as Partial<RequestWithActor>;
    return this.holds(actor, PERMISSIONS.COURSE_VIEW_UNPUBLISHED);
  }

  private holds(actor: AuthenticatedActor | undefined, permission: string): boolean {
    return actor?.permissions.includes(permission as never) ?? false;
  }
}
