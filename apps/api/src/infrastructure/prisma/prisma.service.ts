import { PrismaPg } from '@prisma/adapter-pg';
// Generated client, not the @prisma/client stub. The path is identical from
// src/ and from dist/ (both are three levels below apps/api), so the same
// specifier works in development and in the built output.
import { PrismaClient } from '../../../generated/prisma/index.js';
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { ENV, type Env } from '../../config/index.js';

/**
 * Database access.
 *
 * Prisma 7 connects through a driver adapter rather than a bundled Rust engine.
 * That is what lets the production image ship without the ~40 MB query engine
 * binary — a meaningful saving when images are pulled over Afghan bandwidth.
 *
 * The pool is sized conservatively: the API scales horizontally, so a large
 * per-instance pool exhausts Postgres connections long before it helps latency.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(ENV) env: Env) {
    super({
      adapter: new PrismaPg({
        connectionString: env.DATABASE_URL,
        max: 10,
        // Fail fast rather than piling up requests behind an unreachable database.
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 30_000,
      }),
      // Errors and warnings only. `query` logging would emit parameter values.
      log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Cheap liveness probe for the readiness endpoint. */
  async ping(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }
}
