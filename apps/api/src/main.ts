import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

// Prisma returns BigInt columns (e.g. Document.sizeBytes) as JS `bigint`, which
// JSON.stringify can't serialize by default. Values here stay well under
// Number.MAX_SAFE_INTEGER, so stringifying is safe.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // CORS: use the configured allow-list when present. When CORS_ORIGINS is unset, reflect any
  // origin ONLY outside production (dev/local convenience). In production an empty allow-list is
  // fail-closed (origin:false) rather than reflecting every origin with credentials:true, which
  // would be an open cross-origin credential surface.
  const logger = new Logger('Bootstrap');
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const isProd = process.env.NODE_ENV === 'production';
  let origin: string[] | boolean;
  if (corsOrigins && corsOrigins.length) {
    origin = corsOrigins;
  } else if (isProd) {
    origin = false;
    logger.warn('CORS_ORIGINS is empty in production — CORS is fail-closed (no cross-origin browser requests allowed). Set CORS_ORIGINS to your web origin(s).');
  } else {
    origin = true;
  }
  app.enableCors({ origin, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('PKOS API')
    .setDescription('Personal Knowledge Operating System — foundation API')
    .setVersion('0.0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
