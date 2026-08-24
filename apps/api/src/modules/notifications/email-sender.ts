import type { Locale } from '@afghan-it-academy/shared';

/**
 * Transactional email templates.
 *
 * A closed set rather than free-form subject/body: the sender must be able to
 * render each one in Dari, Pashto and English, and a caller passing raw prose
 * would bypass translation entirely.
 */
export type EmailTemplate = 'email-verification' | 'password-reset' | 'password-changed';

export interface EmailMessage {
  readonly to: string;
  /** The recipient's preferred language, not the requester's. */
  readonly locale: Locale;
  readonly template: EmailTemplate;
  /**
   * Template substitutions. Values are rendered into the message body, so this
   * carries links and display names — never a password, and never a token that
   * is valid for anything beyond the single action the link performs.
   */
  readonly variables: Readonly<Record<string, string>>;
}

/** DI token. A symbol, so nothing can bind to it accidentally by string. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');

/**
 * The port every delivery mechanism implements.
 *
 * Defined here rather than in the identity module because certificates,
 * enrollment receipts and course announcements will all send mail, and none of
 * them should depend on identity to do it.
 *
 * Implementations must not throw for a delivery failure the caller cannot act
 * on. A verification email that bounces should not fail the registration that
 * triggered it — the account exists, and the user can request another.
 */
export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}
