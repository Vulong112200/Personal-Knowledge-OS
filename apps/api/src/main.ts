import { ValidationPipe } from '@nestjs/common';
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

  // Restrict CORS to configured origins in production; fall back to open only when unset
  // (dev/local). Set CORS_ORIGINS to a comma-separated list of allowed web origins.
  const corsOrigins = process.env.CORS_ORIGINS?.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins && corsOrigins.length ? corsOrigins : true,
    credentials: true,
  });

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
