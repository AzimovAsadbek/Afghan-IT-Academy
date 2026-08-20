import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';

import { moduleBoundariesRule } from './module-boundaries.js';

/**
 * These tests exist because the *previous* boundary rule silently stopped
 * matching and nobody noticed for an entire milestone. The architectural
 * guarantee in ADR 0002 is only worth what its enforcement is worth, so the
 * enforcement itself is now covered.
 *
 * Each case names the real-world shape it protects against.
 */

const API = '/repo/apps/api/src';

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
});

describe('boundaries/module-boundaries', () => {
  it('permits legitimate imports and rejects boundary violations', () => {
    ruleTester.run('module-boundaries', moduleBoundariesRule, {
      valid: [
        {
          name: 'cross-module import through the public barrel',
          filename: `${API}/modules/courses/courses.service.ts`,
          code: "import { AuthGuard } from '../identity/index.js';",
        },
        {
          name: 'intra-module import between sibling folders',
          filename: `${API}/modules/identity/auth/auth.service.ts`,
          code: "import { PasswordService } from '../crypto/password.service.js';",
        },
        {
          name: 'intra-module import from a nested folder',
          filename: `${API}/modules/identity/auth/dto/login.dto.ts`,
          code: "import { hash } from '../../crypto/password.service.js';",
        },
        {
          name: 'module importing the common layer',
          filename: `${API}/modules/identity/auth/auth.service.ts`,
          code: "import { ZodValidationPipe } from '../../../common/index.js';",
        },
        {
          name: 'module importing infrastructure',
          filename: `${API}/modules/identity/users/user.service.ts`,
          code: "import { PrismaService } from '../../../infrastructure/prisma/index.js';",
        },
        {
          name: 'composition root importing module barrels',
          filename: `${API}/app.module.ts`,
          code: "import { IdentityModule } from './modules/identity/index.js';",
        },
        {
          name: 'package imports are never restricted',
          filename: `${API}/modules/identity/auth/auth.service.ts`,
          code: "import { Injectable } from '@nestjs/common';",
        },
        {
          name: 'files outside the API layout are ignored',
          filename: '/repo/packages/shared/src/index.ts',
          code: "import { thing } from './other.js';",
        },
      ],

      invalid: [
        {
          // The shape the old specifier-matching rule could never see.
          name: 'sibling module deep import',
          filename: `${API}/modules/courses/courses.service.ts`,
          code: "import { PasswordService } from '../identity/crypto/password.service.js';",
          errors: [{ messageId: 'deepImport' }],
        },
        {
          name: 'deep import from a nested file in another module',
          filename: `${API}/modules/payments/refunds/refund.service.ts`,
          code: "import { UserService } from '../../identity/users/user.service.js';",
          errors: [{ messageId: 'deepImport' }],
        },
        {
          name: 'common importing a domain module, even via its barrel',
          filename: `${API}/common/guards/some.guard.ts`,
          code: "import { AuthService } from '../../modules/identity/index.js';",
          errors: [{ messageId: 'layerViolation' }],
        },
        {
          name: 'infrastructure importing a domain module',
          filename: `${API}/infrastructure/prisma/prisma.service.ts`,
          code: "import { UserService } from '../../modules/identity/index.js';",
          errors: [{ messageId: 'layerViolation' }],
        },
        {
          name: 're-exporting another module internals',
          filename: `${API}/modules/courses/index.ts`,
          code: "export { PasswordService } from '../identity/crypto/password.service.js';",
          errors: [{ messageId: 'deepImport' }],
        },
        {
          name: 'export-all across a module boundary',
          filename: `${API}/modules/courses/index.ts`,
          code: "export * from '../identity/crypto/password.service.js';",
          errors: [{ messageId: 'deepImport' }],
        },
      ],
    });
  });
});
