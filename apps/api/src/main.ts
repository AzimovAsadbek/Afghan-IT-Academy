import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap/index.js';
import { ENV, loadEnvFileForDevelopment, type Env } from './config/index.js';

// Must run before the container is built: the config provider parses
// process.env the moment the module graph is constructed.
loadEnvFileForDevelopment();

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Pino takes over from the default logger; buffering keeps startup logs.
    bufferLogs: true,
    // The global filter owns all error responses.
    abortOnError: false,
  });

  const env = app.get<Env>(ENV);
  configureApp(app, env);

  await app.listen(env.PORT, '0.0.0.0');

  app
    .get(Logger)
    .log(
      { port: env.PORT, prefix: env.API_PREFIX, env: env.NODE_ENV },
      'Afghan IT Academy API started',
    );
}

bootstrap().catch((error: unknown) => {
  // The logger does not exist yet at this point, so console is the only sink.
  console.error('Fatal: API failed to start', error);
  process.exit(1);
});
