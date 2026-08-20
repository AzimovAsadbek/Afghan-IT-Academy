import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';

import { Public } from '../../common/index.js';
import { PrismaService } from '../../infrastructure/prisma/index.js';
import { RedisService } from '../../infrastructure/redis/index.js';

interface DependencyStatus {
  readonly status: 'up' | 'down';
}

interface ReadinessResponse {
  readonly status: 'ready' | 'degraded';
  readonly checks: Readonly<Record<string, DependencyStatus>>;
}

/**
 * Kubernetes-style probes.
 *
 * The distinction matters operationally:
 *   - /health/live  answers "is this process wedged?". It must not touch the
 *     database, or a database outage would make every replica get killed and
 *     restarted, turning a recoverable incident into an outage.
 *   - /health/ready answers "should this replica receive traffic?" and does
 *     check dependencies.
 *
 * Neither endpoint reveals versions, hostnames or error detail: they are
 * unauthenticated, and an attacker should learn nothing from them.
 *
 * Version-neutral on purpose: probe URLs are configured in Kubernetes manifests
 * and load balancers, so they must not move when the API ships a v2.
 */
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready(): Promise<ReadinessResponse> {
    const [database, cache] = await Promise.all([
      this.probe(() => this.prisma.ping()),
      this.probe(() => this.redis.ping()),
    ]);

    const checks = { database, cache } as const;

    if (database.status === 'down' || cache.status === 'down') {
      throw new ServiceUnavailableException({ status: 'degraded', checks });
    }

    return { status: 'ready', checks };
  }

  private async probe(check: () => Promise<unknown>): Promise<DependencyStatus> {
    try {
      await check();
      return { status: 'up' };
    } catch {
      // Swallowed deliberately: the cause belongs in the logs, not in an
      // unauthenticated response body.
      return { status: 'down' };
    }
  }
}
