import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { AppConfig } from './core/infrastructure/config.js';

async function bootstrap(): Promise<void> {
  // Built-in body parser is replaced so the limit fits large entries (content is capped by zod as well).
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  const config = app.get(AppConfig);

  // Handwriting pages can be a few MB; the device caps each push batch well below this (see SYNC.md).
  app.useBodyParser('json', { limit: '16mb' });
  app.disable('x-powered-by');
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  if (config.corsOrigins.length > 0) app.enableCors({ origin: config.corsOrigins, credentials: false });

  await app.listen(config.port);
  new Logger('Bootstrap').log(`Daily API listening on :${config.port}`);
}

void bootstrap();
