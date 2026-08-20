import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';

import { buildLoggerConfig } from './common/index.js';
import { AppConfigModule, ENV, type Env } from './config/index.js';
import { PrismaModule } from './infrastructure/prisma/index.js';
import { RedisModule, RedisService } from './infrastructure/redis/index.js';
import { HealthModule } from './modules/health/index.js';
import { IdentityModule } from './modules/identity/index.js';

/**
 * Application composition root.
 *
 * Structure follows the modular monolith described in
 * docs/architecture/0002-modular-monolith.md:
 *
 *   config/         validated environment, imported by everything
 *   common/         cross-cutting HTTP concerns, no domain knowledge
 *   infrastructure/ technical adapters (database, cache) — no business rules
 *   modules/        business domains; the only place domain logic may live
 *
 * Dependencies point inward and downward only. A domain module may use
 * infrastructure; infrastructure may never import a domain module.
 */
@Module({
  imports: [
    AppConfigModule,

    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [ENV],
      useFactory: (env: Env) => buildLoggerConfig(env),
    }),

    PrismaModule,
    RedisModule,

    /* Rate limiting is backed by Redis so the limit is enforced across every
     * replica. An in-memory store would let an attacker multiply their quota by
     * the number of instances simply by reconnecting. */
    ThrottlerModule.forRootAsync({
      imports: [AppConfigModule, RedisModule],
      inject: [ENV, RedisService],
      useFactory: (env: Env, redis: RedisService) => ({
        throttlers: [{ ttl: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX }],
        storage: new ThrottlerStorageRedisService(redis.client),
        errorMessage: 'Too many requests.',
      }),
    }),

    HealthModule,
    IdentityModule,
  ],
  providers: [
    /* Applied globally: rate limiting must be opt-out per route, never opt-in.
     * An endpoint added next year is protected by default. */
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
