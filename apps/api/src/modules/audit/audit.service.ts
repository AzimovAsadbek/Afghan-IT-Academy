import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';

import type { Prisma } from '../../../generated/prisma/index.js';
import type { ClientContext } from '../../common/index.js';
import { PrismaService, type PrismaTransactionClient } from '../../infrastructure/prisma/index.js';

/**
 * A security-relevant event worth keeping.
 *
 * `metadata` is for context that helps an investigation — which session, which
 * role, how many attempts. It must never carry a credential, a raw token, or a
 * token digest: the audit log is read by support staff and exported for
 * analysis, and it long outlives the secret's usefulness.
 */
export interface AuditEntry {
  /** Dotted token: `domain.entity.verb`, e.g. `auth.login.failed`. */
  readonly action: string;
  /** Who did it. Null for anonymous attempts, such as a failed login. */
  readonly actorId?: string | null;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/**
 * Writes the append-only security record.
 *
 * Two calling styles, and the difference matters:
 *
 * - `record()` is best-effort. A failed insert is logged at error level and
 *   swallowed, because losing an audit row is not a reason to fail the user's
 *   login.
 * - `recordInTransaction()` participates in the caller's transaction, so the
 *   action and its audit row commit or roll back together. Use it wherever an
 *   unaudited change would be worse than no change at all — role grants,
 *   suspensions, password changes.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: Logger,
  ) {}

  /** Best-effort. Never throws, never fails the request that triggered it. */
  async record(entry: AuditEntry, context: ClientContext): Promise<void> {
    try {
      await this.prisma.auditLog.create({ data: this.toRow(entry, context) });
    } catch (error: unknown) {
      // The row is lost, so the log line is the only remaining record. Emit the
      // whole entry rather than just the failure, so it is still recoverable
      // from the log pipeline.
      this.logger.error(
        { err: error, audit: entry, requestId: context.requestId },
        'Failed to write audit record',
      );
    }
  }

  /**
   * Writes inside the caller's transaction. Throws on failure, which rolls back
   * the change being audited — deliberate: an unaudited role grant is worse
   * than a failed one.
   */
  async recordInTransaction(
    tx: PrismaTransactionClient,
    entry: AuditEntry,
    context: ClientContext,
  ): Promise<void> {
    await tx.auditLog.create({ data: this.toRow(entry, context) });
  }

  private toRow(entry: AuditEntry, context: ClientContext): Prisma.AuditLogUncheckedCreateInput {
    return {
      action: entry.action,
      actorId: entry.actorId ?? null,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      ipPrefix: context.ipPrefix,
      userAgent: context.userAgent,
      requestId: context.requestId,
      // Spread rather than assign undefined: exactOptionalPropertyTypes draws a
      // distinction between "absent" and "present but undefined", and Prisma's
      // Json input accepts only the former.
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
    };
  }
}
