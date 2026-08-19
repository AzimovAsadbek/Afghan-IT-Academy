import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * End-to-end suite: boots the real Nest application against real Postgres and
 * Redis containers. Kept separate from the unit suite so `pnpm test` stays fast
 * and runnable without infrastructure.
 */
export default defineConfig({
  // Vitest 4 transforms with Oxc by default; it must be off so SWC owns the
  // pipeline and decorator metadata survives.
  oxc: false,
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.e2e-spec.ts'],
    setupFiles: ['./test/setup-e2e.ts'],
    // Shared database state makes parallel files flaky.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
