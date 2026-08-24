import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import type { EmailMessage, EmailSender } from './email-sender.js';

/**
 * Development sender: writes the message to the log instead of delivering it.
 *
 * This is how a developer clicks a verification link locally without running a
 * mail server. It is **not** a fallback — `NotificationsModule` refuses to
 * provide it in production, because a platform that silently logs its
 * verification emails instead of sending them looks healthy while nobody can
 * complete registration.
 *
 * Logging the link is acceptable precisely because it is confined to
 * development. The same behaviour in production would put live single-use
 * credentials into the log pipeline, where they outlive their usefulness and
 * are readable by anyone with log access.
 */
@Injectable()
export class LoggingEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  send(message: EmailMessage): Promise<void> {
    this.logger.log(
      {
        to: message.to,
        locale: message.locale,
        template: message.template,
        variables: message.variables,
      },
      `[dev] Email not sent — ${message.template}`,
    );

    return Promise.resolve();
  }
}
