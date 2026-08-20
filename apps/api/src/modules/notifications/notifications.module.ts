import { Global, Module } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import { ENV, type Env } from '../../config/index.js';
import { EMAIL_SENDER, type EmailSender } from './email-sender.js';
import { LoggingEmailSender } from './logging-email-sender.js';

/**
 * Outbound notifications.
 *
 * Only a development sender exists today; the real provider arrives with the
 * notifications milestone. Rather than let that gap pass silently, the factory
 * below **refuses to start in production**.
 *
 * That is a deliberate trade. The platform cannot function without verification
 * and password-reset email, so a production boot that quietly writes those
 * links to the log would present as healthy while no user could register or
 * recover an account — the kind of failure that is discovered by a support
 * ticket weeks later. Failing at startup makes the missing dependency
 * impossible to miss and impossible to deploy past.
 */

/**
 * Chooses the delivery mechanism for the current environment.
 *
 * Exported as a plain function so the production guard can be tested directly —
 * a security behaviour asserted only by "the app didn't start" is a behaviour
 * nobody notices losing.
 */
export function createEmailSender(env: Env, logger: Logger): EmailSender {
  if (env.NODE_ENV === 'production') {
    throw new Error(
      'No production email provider is configured. The only EmailSender available is the ' +
        'development logger, which would write live verification and password-reset links ' +
        'to the log instead of delivering them. Configure a real provider before deploying.',
    );
  }

  return new LoggingEmailSender(logger);
}

@Global()
@Module({
  providers: [
    {
      provide: EMAIL_SENDER,
      inject: [ENV, Logger],
      useFactory: createEmailSender,
    },
  ],
  exports: [EMAIL_SENDER],
})
export class NotificationsModule {}
