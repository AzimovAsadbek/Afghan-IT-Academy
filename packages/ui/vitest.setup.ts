import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * React Testing Library only auto-cleans when a global `afterEach` exists.
 * `globals: false` is deliberate (explicit imports beat ambient magic), so the
 * teardown is registered here instead — without it, every render accumulates in
 * the same document and queries match elements from earlier tests.
 */
afterEach(() => {
  cleanup();
});
