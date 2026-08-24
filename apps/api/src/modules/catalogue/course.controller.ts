import {
  ERROR_CODES,
  PERMISSIONS,
  isLocale,
  type CourseDetail,
  type Locale,
} from '@afghan-it-academy/shared';
import { Controller, Get, HttpStatus, Param, Query, Req } from '@nestjs/common';
import type { Request } from 'express';

import {
  DomainException,
  Public,
  ZodValidationPipe,
  type AuthenticatedActor,
  type RequestWithActor,
} from '../../common/index.js';
import { DEFAULT_LOCALE } from '@afghan-it-academy/shared';
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
   * From `Accept-Language`, which the web app sets from the active locale. An
   * unrecognised or absent header falls back to the default rather than
   * erroring: a missing header is an ordinary request from a script or a crawler,
   * not a client mistake worth rejecting.
   */
  private localeOf(request: Request): Locale {
    const header = request.headers['accept-language'];
    if (typeof header !== 'string') return DEFAULT_LOCALE;

    // Take the first tag only. Full q-value negotiation buys nothing here: the
    // client is our own app and sends exactly one locale.
    const first = header.split(',')[0]?.trim() ?? '';
    return isLocale(first) ? first : DEFAULT_LOCALE;
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
