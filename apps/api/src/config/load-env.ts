import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads the repository-root `.env` for local development.
 *
 * Production deliberately does NOT read a file: the orchestrator injects
 * environment variables, and a stray `.env` inside a production image would be
 * a secret sitting in a layer. Node 24 provides `loadEnvFile` natively, so this
 * needs no dependency.
 *
 * Must be called before the Nest container is created, since the config
 * provider parses `process.env` at construction time.
 */
export function loadEnvFileForDevelopment(): void {
  if (process.env.NODE_ENV === 'production') return;

  // The API emits CommonJS, so __dirname is the correct primitive here.
  // dist/config -> dist -> apps/api -> apps -> repository root
  const envFile = resolve(__dirname, '../../../../.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
