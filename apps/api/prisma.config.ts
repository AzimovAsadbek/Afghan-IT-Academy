import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (migrate, studio, db push).
 *
 * Prisma 7 no longer reads the connection string from schema.prisma. This file
 * is CLI-only: the running application connects through the driver adapter in
 * src/infrastructure/prisma, never through this config.
 *
 * Deliberately avoids `import.meta` and `__dirname`. Prisma loads this file with
 * its own ESM loader, so `__dirname` is undefined; the API's tsconfig emits
 * CommonJS, so `import.meta` fails to typecheck. Walking up from the working
 * directory satisfies both and works regardless of where the command was run.
 */

/** Finds the repository root by the marker file that only it has. */
function findRepositoryRoot(startDirectory: string): string | undefined {
  let current = resolve(startDirectory);

  for (;;) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;

    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

// Node 24 loads .env natively, so no dotenv dependency is needed. The file lives
// at the repository root because docker-compose reads the same one.
const repositoryRoot = findRepositoryRoot(process.cwd());
if (repositoryRoot) {
  const envFile = resolve(repositoryRoot, '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

/**
 * Commands that only read the schema and never open a connection.
 *
 * `generate` in particular runs during the Docker image build, where no
 * database exists and none is needed. Demanding a URL there fails the build for
 * no reason, so the check is scoped to the commands that actually connect.
 */
const OFFLINE_COMMANDS = new Set(['generate', 'validate', 'format', 'version']);
const requiresConnection = !process.argv.some((arg) => OFFLINE_COMMANDS.has(arg));

const databaseUrl = process.env.DATABASE_URL ?? '';
if (!databaseUrl && requiresConnection) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env at the repository root, ' +
      'or export DATABASE_URL before running a Prisma command.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: databaseUrl,
  },
});
