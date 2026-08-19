import { Global, Module } from '@nestjs/common';

import { parseEnv, type Env } from './env.schema.js';

/**
 * Injection token for the validated environment.
 *
 * Consumers inject `Env` rather than calling `configService.get<string>('X')`:
 * the former is checked by the compiler, the latter is a stringly-typed lookup
 * that fails at runtime when a key is renamed.
 */
export const ENV = Symbol('ENV');

@Global()
@Module({
  providers: [
    {
      provide: ENV,
      // Parsed once at module construction: fail fast, before any listener binds.
      useFactory: (): Env => parseEnv(process.env),
    },
  ],
  exports: [ENV],
})
export class AppConfigModule {}
