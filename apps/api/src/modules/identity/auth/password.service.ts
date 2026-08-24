import { Inject, Injectable } from '@nestjs/common';

import type { ClientContext } from '../../../common/index.js';
import { ENV, type Env } from '../../../config/index.js';
import { PrismaService, toDomainLocale } from '../../../infrastructure/prisma/index.js';
import { AuditService } from '../../audit/index.js';
import { EMAIL_SENDER, type EmailSender } from '../../notifications/index.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { PasswordService } from '../crypto/password.service.js';
import { SessionService } from '../sessions/session.service.js';
import { OneTimeTokenService } from '../tokens/one-time-token.service.js';
import { UserService } from '../users/user.service.js';

/** Reset requests honoured per account per hour. */
const MAX_RESET_REQUESTS_PER_HOUR = 3;
const RESET_WINDOW_MS = 60 * 60 * 1000;

export type ChangePasswordResult =
  | { readonly ok: true; readonly revokedSessions: number }
  | { readonly ok: false; readonly reason: 'wrong_password' };

export type ResetResult = { readonly ok: true } | { readonly ok: false };

/**
 * Password change and recovery.
 *
 * Both paths end the same way: every *other* session is revoked. A password
 * change is usually a response to "someone may have my password", and leaving
 * the attacker's session alive makes the change theatre. The session performing
 * the change is spared so the user is not signed out of the page they are
 * looking at; a reset, where there is no trusted session, revokes everything.
 */
@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly oneTimeTokens: OneTimeTokenService,
    private readonly audit: AuditService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Changes the password of a signed-in user.
   *
   * The current password is required even though the session already proves
   * identity: a session left open on a shared machine should not be enough to
   * take the account permanently.
   */
  async change(
    userId: string,
    currentSessionId: string,
    input: { currentPassword: string; newPassword: string },
    context: ClientContext,
  ): Promise<ChangePasswordResult> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { passwordHash: true, email: true, displayName: true, preferredLocale: true },
    });

    const matches = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!matches) {
      await this.audit.record(
        {
          action: AUTH_ACTIONS.LOGIN_FAILED,
          actorId: userId,
          entityType: 'User',
          entityId: userId,
          metadata: { reason: 'change_password_wrong_current' },
        },
        context,
      );
      return { ok: false, reason: 'wrong_password' };
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.users.updatePasswordHash(userId, passwordHash);

    const revokedSessions = await this.sessions.revokeAllForUser(
      userId,
      'PASSWORD_CHANGED',
      currentSessionId,
    );

    await this.audit.record(
      {
        action: AUTH_ACTIONS.PASSWORD_CHANGED,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
        metadata: { revokedSessions },
      },
      context,
    );

    await this.notifyPasswordChanged(
      user.email,
      user.displayName,
      toDomainLocale(user.preferredLocale),
    );

    return { ok: true, revokedSessions };
  }

  /**
   * Starts a recovery.
   *
   * Returns nothing whatever the outcome. An unknown address, a suspended
   * account and a successful send are indistinguishable — the response to
   * "forgot password" is the single easiest place to leak a user list, because
   * it requires no credential at all.
   */
  async requestReset(email: string, context: ClientContext): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: UserService.normaliseEmail(email) },
      select: {
        id: true,
        email: true,
        displayName: true,
        preferredLocale: true,
        status: true,
      },
    });

    if (!user) return;
    // A suspended or closed account must not be recoverable by its former
    // holder; lifting that is an administrative decision.
    if (user.status === 'SUSPENDED' || user.status === 'DEACTIVATED') return;

    const recent = await this.oneTimeTokens.countRecent(user.id, 'PASSWORD_RESET', RESET_WINDOW_MS);
    // Capped per account, which a per-address limit cannot do: an attacker
    // flooding one inbox simply changes their own address.
    if (recent >= MAX_RESET_REQUESTS_PER_HOUR) return;

    const issued = await this.oneTimeTokens.issue(
      user.id,
      'PASSWORD_RESET',
      this.env.AUTH_PASSWORD_RESET_TTL_SECONDS * 1000,
      context.ipPrefix,
    );

    const locale = toDomainLocale(user.preferredLocale);
    const link = new URL(`/${locale}/reset-password`, this.env.WEB_APP_URL);
    link.searchParams.set('token', issued.token);

    await this.email.send({
      to: user.email,
      locale,
      template: 'password-reset',
      variables: { displayName: user.displayName, resetUrl: link.toString() },
    });

    await this.audit.record(
      {
        action: AUTH_ACTIONS.PASSWORD_RESET_REQUESTED,
        actorId: user.id,
        entityType: 'User',
        entityId: user.id,
      },
      context,
    );
  }

  /**
   * Completes a recovery.
   *
   * Redemption and the password write share a transaction, so a failure cannot
   * consume the token without setting the password — which would lock the user
   * out with a link that no longer works.
   *
   * Every session is revoked, including any the attacker holds. There is no
   * session to spare here: whoever is resetting is, by definition, not signed in.
   */
  async completeReset(
    rawToken: string,
    newPassword: string,
    context: ClientContext,
  ): Promise<ResetResult> {
    const passwordHash = await this.passwords.hash(newPassword);

    const userId = await this.prisma.$transaction(async (tx) => {
      const redemption = await this.oneTimeTokens.redeem(rawToken, 'PASSWORD_RESET', tx);
      if (!redemption.ok) return null;

      await tx.user.update({
        where: { id: redemption.userId },
        data: {
          passwordHash,
          // Completing a reset proves control of the mailbox, so an unverified
          // address becomes verified and a pending account becomes usable.
          emailVerifiedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await tx.user.updateMany({
        where: { id: redemption.userId, status: 'PENDING_VERIFICATION' },
        data: { status: 'ACTIVE' },
      });

      return redemption.userId;
    });

    if (userId === null) {
      await this.audit.record({ action: AUTH_ACTIONS.PASSWORD_RESET_FAILED }, context);
      return { ok: false };
    }

    const revokedSessions = await this.sessions.revokeAllForUser(userId, 'PASSWORD_RESET');

    await this.audit.record(
      {
        action: AUTH_ACTIONS.PASSWORD_RESET_COMPLETED,
        actorId: userId,
        entityType: 'User',
        entityId: userId,
        metadata: { revokedSessions },
      },
      context,
    );

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, displayName: true, preferredLocale: true },
    });

    await this.notifyPasswordChanged(
      user.email,
      user.displayName,
      toDomainLocale(user.preferredLocale),
    );

    return { ok: true };
  }

  /**
   * Tells the owner their password changed.
   *
   * This is the control that makes an unnoticed takeover hard: if the change was
   * not theirs, this message is how they find out while it still matters.
   */
  private async notifyPasswordChanged(
    email: string,
    displayName: string,
    locale: ReturnType<typeof toDomainLocale>,
  ): Promise<void> {
    await this.email.send({
      to: email,
      locale,
      template: 'password-changed',
      variables: { displayName },
    });
  }
}
