import { describe, expect, it } from 'vitest';

import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE,
  PERMISSIONS,
  ROLES,
  isPermissionKey,
  isRoleKey,
} from './permissions.js';

/**
 * These keys are stored in the database and referenced by seeded grants, so the
 * catalogue's invariants are contract, not style. A duplicate value would make
 * two named permissions silently the same capability; a malformed key would slip
 * past a `resource:action` parser later.
 */

describe('permission catalogue', () => {
  it('uses resource:action for every key', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(key, `${key} is not resource:action`).toMatch(
        /^[a-z]+(?:_[a-z]+)*:[a-z]+(?:_[a-z]+)*$/,
      );
    }
  });

  it('has no duplicate values', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it('exposes every declared permission through ALL_PERMISSIONS', () => {
    expect(ALL_PERMISSIONS.length).toBe(Object.keys(PERMISSIONS).length);
  });

  it('recognises its own keys', () => {
    for (const key of ALL_PERMISSIONS) {
      expect(isPermissionKey(key)).toBe(true);
    }
  });

  it.each([['course:destroy'], ['COURSE_CREATE'], ['course'], [''], [null], [42]])(
    'rejects %s',
    (value) => {
      expect(isPermissionKey(value)).toBe(false);
    },
  );
});

describe('role catalogue', () => {
  it('uses SCREAMING_SNAKE_CASE keys', () => {
    for (const role of ALL_ROLES) {
      expect(role).toMatch(/^[A-Z]+(?:_[A-Z]+)*$/);
    }
  });

  it('has no duplicate values', () => {
    expect(new Set(ALL_ROLES).size).toBe(ALL_ROLES.length);
  });

  it('names each role identically to its constant, so the two cannot drift', () => {
    for (const [constant, value] of Object.entries(ROLES)) {
      expect(value).toBe(constant);
    }
  });

  it('defaults new accounts to STUDENT', () => {
    expect(DEFAULT_ROLE).toBe(ROLES.STUDENT);
    expect(ALL_ROLES).toContain(DEFAULT_ROLE);
  });

  it.each([['student'], ['ROOT'], [''], [undefined]])('rejects %s', (value) => {
    expect(isRoleKey(value)).toBe(false);
  });
});
