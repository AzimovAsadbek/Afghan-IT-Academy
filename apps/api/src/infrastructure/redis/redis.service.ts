import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { ENV, type Env } from '../../config/index.js';

/**
 * Redis connection.
 *
 * Backs rate limiting, session/refresh-token revocation and the BullMQ job
 * queues. Retry behaviour is tuned for an unreliable network: back off, keep
 * trying, and let the readiness probe report the degradation rather than
 * crashing the process on a transient blip.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(@Inject(ENV) env: Env) {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      // Exponential-ish backoff capped at 5s; unbounded growth would leave the
      // instance effectively dead after a long outage.
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
      reconnectOnError: (error) => error.message.includes('READONLY'),
    });

    this.client.on('error', (error: Error) => {
      // Logged, not thrown: a Redis outage degrades the service, it does not
      // justify taking the whole API down.
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }

  /** Rejects if the connection is down; ioredis resolves only on a PONG reply. */
  async ping(): Promise<void> {
    await this.client.ping();
  }
}
