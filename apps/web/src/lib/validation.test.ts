import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@afghan-it-academy/shared/policy';
import { describe, expect, it } from 'vitest';

import { collectErrors, validateDisplayName, validateEmail, validatePassword } from './validation';

describe('validateEmail', () => {
  it('accepts an ordinary address', () => {
    expect(validateEmail('learner@example.af')).toBeNull();
  });

  it('accepts plus-addressing rather than rejecting a valid address', () => {
    expect(validateEmail('learner+courses@example.af')).toBeNull();
  });

  it('rejects an empty value as required, not as malformed', () => {
    expect(validateEmail('   ')).toBe('required');
  });

  it('rejects a value with no domain', () => {
    expect(validateEmail('learner@')).toBe('invalid_email');
  });
});

describe('validatePassword', () => {
  it('accepts a password at the minimum length', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
  });

  it('rejects one character below the minimum', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('too_short');
  });

  it('rejects one character above the maximum, which is a hashing-cost guard', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe('too_long');
  });

  it('rejects surrounding whitespace, which a user cannot see they typed', () => {
    expect(validatePassword(` ${'a'.repeat(PASSWORD_MIN_LENGTH)}`)).toBe(
      'leading_or_trailing_whitespace',
    );
  });
});

describe('validateDisplayName', () => {
  it('accepts an ordinary name', () => {
    expect(validateDisplayName('Ahmad Rezai')).toBeNull();
  });

  it('rejects an embedded control character, which would corrupt a log or mail header', () => {
    // Written as an escape so this file contains no control character of its own.
    expect(validateDisplayName('Ahmad\u0007')).toBe('invalid_characters');
  });

  it('accepts a Dari name', () => {
    expect(validateDisplayName('احمد رضایی')).toBeNull();
  });
});

describe('collectErrors', () => {
  it('returns an empty object when every field is valid', () => {
    expect(collectErrors({ email: null, password: null })).toEqual({});
  });

  it('keeps only the fields that failed', () => {
    expect(collectErrors({ email: 'invalid_email', password: null })).toEqual({
      email: 'invalid_email',
    });
  });
});
