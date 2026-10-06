import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { assertConfig, config } from './config';
import { setupApp } from './setup';

async function bootstrap() {
  assertConfig();
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`Purchase API: http://localhost:${config.port}/api`);
}

void bootstrap();
