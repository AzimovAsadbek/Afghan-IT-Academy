import { ERROR_CODES } from '@afghan-it-academy/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  DomainException,
  Public,
  ZodValidationPipe,
  clientContextOf,
} from '../../../common/index.js';
import { ENV, type Env } from '../../../config/index.js';
import { AUTH_ACTIONS } from '../auth-actions.js';
import { AuditService } from '../../audit/index.js';
import { SessionService } from '../sessions/session.service.js';
import {
  clearSessionCookies,
  readAccessToken,
  readRefreshToken,
  setSessionCookies,
} from './auth-cookies.js';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from './auth.dto.js';
import { AuthService, type LoginRefusal } from './auth.service.js';
import { PasswordRecoveryService } from './password.service.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Authentication endpoints.
 *
 * ## Rate limits
 *
 * Every limit here is per client address, applied on top of the global default.
 * They are deliberately tighter than the rest of the API because these are the
 * endpoints worth attacking, and deliberately not so tight that a learner on a
 * shared connection — a university lab, an internet café — is locked out of
 * their own account. Per-account limits, which per-address limits cannot
 * provide, live in AuthService.
 *
 * ## Response bodies
 *
 * Registration, resend and verification report the same result regardless of
 * whether the address is known. See AuthService for why.
 */
/*
 * Public as a class: these endpoints are how a caller *obtains* a session, so
 * requiring one would be circular. Logout is included deliberately — signing out
 * must succeed even when the session has already expired, or the browser is left
 * holding cookies it cannot clear.
 */
@Public()
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly recovery: PasswordRecoveryService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.register(body, clientContextOf(request));

    // 202 with an identical body either way. A 201/409 split would report
    // account existence to anyone willing to submit an address.
    return { status: 'verification_sent' };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async verifyEmail(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    const result = await this.auth.verifyEmail(body.token, clientContextOf(request));

    if (!result.ok) {
      // A wrong, expired or already-used token are one response: distinguishing
      // them tells a token-guessing attacker which guesses are close.
      throw new ForbiddenException('Verification link is invalid or has expired.');
    }

    return { status: 'verified' };
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.auth.resendVerification(body.email, clientContextOf(request));
    return { status: 'verification_sent' };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  // Five attempts per address per fifteen minutes. Enough for a person who has
  // forgotten which password they used; far too few to work through a list.
  @Throttle({ default: { limit: 5, ttl: 15 * MINUTE } })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    const result = await this.auth.login(body, clientContextOf(request));

    if (!result.ok) throw this.refusalToException(result.reason);

    setSessionCookies(response, result.session, this.env);
    return { status: 'authenticated' };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  // Generous: a client with several tabs open refreshes legitimately often.
  @Throttle({ default: { limit: 60, ttl: HOUR } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    const presented = readRefreshToken(request);
    const context = clientContextOf(request);

    if (presented === null) throw new UnauthorizedException('No refresh token was presented.');

    const result = await this.sessions.refresh(presented, context);

    if (!result.ok) {
      // Clear the cookies so a browser holding a dead token stops replaying it
      // on every page load.
      clearSessionCookies(response, this.env);
      throw new UnauthorizedException('Session has expired. Sign in again.');
    }

    await this.audit.record(
      {
        action: AUTH_ACTIONS.REFRESH_ROTATED,
        actorId: result.userId,
        entityType: 'Session',
        entityId: result.session.sessionId,
      },
      context,
    );

    setSessionCookies(response, result.session, this.env);
    return { status: 'refreshed' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    const accessToken = readAccessToken(request);
    const context = clientContextOf(request);

    if (accessToken !== null) {
      const active = await this.sessions.resolveAccessToken(accessToken);
      if (active) await this.auth.logout(active.sessionId, active.userId, context);
    }

    // Cookies are cleared regardless. Logging out must always leave the browser
    // in a signed-out state, even if the session had already expired server
    // side — otherwise the UI shows a signed-in user who cannot do anything.
    clearSessionCookies(response, this.env);
    return { status: 'signed_out' };
  }

  /**
   * Starts a password recovery.
   *
   * Always 202 with the same body. This endpoint requires no credential at all,
   * which makes it the easiest place in the whole system to enumerate accounts —
   * so an unknown address, a suspended account, a throttled account and a
   * successful send are one response.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: HOUR } })
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() request: Request,
  ): Promise<{ status: string }> {
    await this.recovery.requestReset(body.email, clientContextOf(request));
    return { status: 'recovery_email_sent' };
  }

  /** Completes a recovery and signs every device out. */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: HOUR } })
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: string }> {
    const result = await this.recovery.completeReset(
      body.token,
      body.newPassword,
      clientContextOf(request),
    );

    if (!result.ok) {
      throw new DomainException(
        ERROR_CODES.SESSION_EXPIRED,
        HttpStatus.FORBIDDEN,
        'Reset link is invalid or has expired.',
      );
    }

    // Every session is gone, including any this browser held.
    clearSessionCookies(response, this.env);
    return { status: 'password_reset' };
  }

  /**
   * Maps a refusal to a response.
   *
   * `invalid_credentials` covers both an unknown account and a wrong password.
   * The remaining reasons are only ever produced *after* a correct password, so
   * naming them discloses nothing to someone who does not already hold the
   * credential — and saves a legitimate user from being told "wrong password"
   * when their password is right.
   */
  private refusalToException(reason: LoginRefusal): DomainException {
    switch (reason) {
      case 'invalid_credentials':
        return new DomainException(
          ERROR_CODES.INVALID_CREDENTIALS,
          HttpStatus.UNAUTHORIZED,
          'Email address or password is incorrect.',
        );
      case 'account_locked':
        return new DomainException(
          ERROR_CODES.ACCOUNT_LOCKED,
          HttpStatus.FORBIDDEN,
          'Too many failed attempts. Try again shortly.',
        );
      case 'account_disabled':
        return new DomainException(
          ERROR_CODES.ACCOUNT_DISABLED,
          HttpStatus.FORBIDDEN,
          'This account is not active.',
        );
      case 'email_not_verified':
        return new DomainException(
          ERROR_CODES.EMAIL_NOT_VERIFIED,
          HttpStatus.FORBIDDEN,
          'Verify your email address before signing in.',
        );
    }
  }
}
