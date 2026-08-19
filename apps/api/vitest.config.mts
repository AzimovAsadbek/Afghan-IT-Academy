import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * SWC handles the transform rather than esbuild: NestJS depends on
 * `emitDecoratorMetadata`, which esbuild does not implement, so dependency
 * injection silently breaks in tests without it.
 */
export default defineConfig({
  // Vitest 4 transforms with Oxc by default; it must be off so SWC owns the
  // pipeline and decorator metadata survives.
  oxc: false,
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/**/index.ts', 'src/**/*.module.ts'],
    },
  },
});
