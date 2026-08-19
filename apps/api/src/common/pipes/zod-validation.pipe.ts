import type { FieldError } from '@afghan-it-academy/shared';
import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

import { FieldValidationException } from '../exceptions/field-validation.exception.js';

/**
 * Validates and *replaces* a handler argument with the parsed value.
 *
 * Returning `schema.parse()` output rather than the raw input is the point:
 * unknown keys are stripped, so a client cannot smuggle extra fields into an
 * object that is later passed to Prisma — the mass-assignment hole that turns
 * "update my display name" into "make me an admin".
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown): TOutput {
    const result = this.schema.safeParse(value);

    if (!result.success) {
      const fields: FieldError[] = result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        // The Zod issue code is already a stable machine token (`too_small`,
        // `invalid_type`), which is exactly what the client needs to translate.
        rule: issue.code,
      }));
      throw new FieldValidationException(fields);
    }

    return result.data;
  }
}
