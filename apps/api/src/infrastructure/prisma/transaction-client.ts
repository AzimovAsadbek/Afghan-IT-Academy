import type { Prisma } from '../../../generated/prisma/index.js';

/**
 * The client handed to a `$transaction` callback.
 *
 * Re-exported from here so domain services can accept a transaction without
 * importing the generated client path directly — that path is an implementation
 * detail of this layer, and it has already moved once.
 */
export type PrismaTransactionClient = Prisma.TransactionClient;
