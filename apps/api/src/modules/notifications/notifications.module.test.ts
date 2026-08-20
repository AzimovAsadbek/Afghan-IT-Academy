import type { Logger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';

import type { Env } from '../../config/index.js';
import { LoggingEmailSender } from './logging-email-sender.js';
import { createEmailSender } from './notifications.module.js';

const logger = { log: vi.fn(), error: vi.fn() } as unknown as Logger;

/**
 * The production guard is the only thing preventing a deploy in which
 * verification and password-reset links are written to the log instead of
 * being delivered — a state where the platform looks healthy while nobody can
 * register or recover an account.
 */
describe('createEmailSender', () => {
  it.each(['development', 'test'] as const)('provides the logging sender in %s', (nodeEnv) => {
    const sender = createEmailSender({ NODE_ENV: nodeEnv } as Env, logger);
    expect(sender).toBeInstanceOf(LoggingEmailSender);
  });

  it('refuses to start in production while no real provider exists', () => {
    expect(() => createEmailSender({ NODE_ENV: 'production' } as Env, logger)).toThrow(
      /No production email provider is configured/,
    );
  });

  it('explains what to do, not just that it failed', () => {
    expect(() => createEmailSender({ NODE_ENV: 'production' } as Env, logger)).toThrow(
      /Configure a real provider before deploying/,
    );
  });
});
