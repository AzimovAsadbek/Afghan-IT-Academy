import { dirname, resolve, sep } from 'node:path';

/**
 * Enforces the modular-monolith boundaries from ADR 0002 on *resolved paths*.
 *
 * ## Why this is a custom rule
 *
 * The previous approach used `no-restricted-imports` patterns. That rule matches
 * the import *specifier string*, not the file it resolves to, so the most likely
 * violation shape was invisible:
 *
 *     modules/courses/x.ts → import '../identity/crypto/password.service.js'
 *
 * contains no `modules/` segment and matched nothing. A probe confirmed it
 * linted clean.
 *
 * No string pattern can fix this, because a legitimate intra-module import
 * (`modules/identity/auth/x.ts` → `../crypto/password.service.js`) and a
 * cross-module violation (`modules/courses/x.ts` →
 * `../identity/crypto/password.service.js`) are the same shape. Telling them
 * apart requires knowing which module each *file* belongs to.
 *
 * `eslint-plugin-import-x`'s `no-restricted-paths` does work on resolved paths,
 * but its zones are cwd-relative and lint runs from two different working
 * directories here (the package root and the repository root), and expressing
 * the intra-module exemption needs one generated zone per module. Fifty lines
 * of exact rule beat a dependency plus fragile configuration.
 *
 * ## Invariants
 *
 * 1. A module's internals are private. Anything outside `modules/<name>/` may
 *    import only `modules/<name>/index.ts`.
 * 2. `common/` and `infrastructure/` may not import a domain module at all —
 *    dependencies point inward. The composition root (`app.module.ts`) is
 *    exempt from this one by necessity: composing modules is its job.
 */

/** Normalises Windows separators so path logic is platform-independent. */
function toPosix(filePath) {
  return filePath.split(sep).join('/');
}

/**
 * Returns the module a file belongs to, or null when it is not inside one.
 * `.../src/modules/identity/auth/auth.service.ts` -> 'identity'
 */
function moduleOf(posixPath) {
  const match = /\/src\/modules\/([^/]+)\//.exec(posixPath);
  return match ? match[1] : null;
}

/** True when the resolved path is the module's public barrel. */
function isBarrel(posixPath, moduleName) {
  return new RegExp(`/src/modules/${moduleName}/index\\.(ts|js)$`).test(posixPath);
}

function isInsideLayer(posixPath, layer) {
  return posixPath.includes(`/src/${layer}/`);
}

export const moduleBoundariesRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce modular-monolith module boundaries on resolved import paths.',
    },
    schema: [],
    messages: {
      deepImport:
        "'{{target}}' is internal to the '{{module}}' module. Import from that module's index.ts barrel instead, and export it there if it is meant to be public.",
      layerViolation:
        "'{{layer}}' must not import the '{{module}}' domain module. Dependencies point inward: define a port in '{{layer}}' and let the module implement it.",
    },
  },

  create(context) {
    const fromFile = toPosix(context.filename);
    const fromModule = moduleOf(fromFile);
    const fromDir = dirname(context.filename);

    function check(node, specifier) {
      // Only relative specifiers can reach into another module's internals.
      if (!specifier.startsWith('.')) return;

      // NodeNext requires a `.js` suffix on TypeScript sources; the file on disk
      // is `.ts`. Compare on the extensionless path so both forms agree.
      const resolved = toPosix(resolve(fromDir, specifier)).replace(/\.(js|ts)$/, '');
      const targetModule = moduleOf(`${resolved}/`);

      if (targetModule === null) return;

      // Invariant 2: inward-pointing layers may not depend on a domain module.
      for (const layer of ['common', 'infrastructure']) {
        if (isInsideLayer(fromFile, layer)) {
          context.report({
            node,
            messageId: 'layerViolation',
            data: { layer, module: targetModule },
          });
          return;
        }
      }

      // Intra-module imports are a module's own business.
      if (fromModule === targetModule) return;

      // Invariant 1: everything else may only reach the public barrel.
      if (isBarrel(`${resolved}.ts`, targetModule)) return;

      context.report({
        node,
        messageId: 'deepImport',
        data: { target: specifier, module: targetModule },
      });
    }

    return {
      ImportDeclaration: (node) => {
        check(node, node.source.value);
      },
      ExportNamedDeclaration: (node) => {
        if (node.source) check(node, node.source.value);
      },
      ExportAllDeclaration: (node) => {
        if (node.source) check(node, node.source.value);
      },
    };
  },
};

/** Plugin wrapper so the rule can be referenced as `boundaries/module-boundaries`. */
export const boundariesPlugin = {
  rules: { 'module-boundaries': moduleBoundariesRule },
};
