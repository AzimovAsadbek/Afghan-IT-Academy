export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_METADATA,
  getDirection,
  isLocale,
  isRtl,
  resolveLocale,
  type Locale,
  type TextDirection,
} from './i18n/locales.js';

export {
  ERROR_CODES,
  type ApiErrorResponse,
  type ErrorCode,
  type FieldError,
} from './errors/error-codes.js';

export {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  ONE_TIME_TOKEN_MAX_LENGTH,
  ONE_TIME_TOKEN_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from './validation/policy.js';

export {
  emailSchema,
  idSchema,
  localeSchema,
  paginationSchema,
  passwordSchema,
  slugSchema,
  type Paginated,
  type PaginationInput,
} from './validation/primitives.js';

export {
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLES,
  isPermissionKey,
  isRoleKey,
  type PermissionKey,
  type RoleKey,
} from './authorization/permissions.js';

export {
  ALL_COURSE_LEVELS,
  ALL_SUBJECTS,
  COURSE_LEVELS,
  COURSE_STATUSES,
  SUBJECTS,
  isCourseLevel,
  isSubjectKey,
  type CourseDetail,
  type CourseLevel,
  type CourseStatus,
  type CourseSummary,
  type SubjectKey,
} from './catalogue/catalogue.js';
