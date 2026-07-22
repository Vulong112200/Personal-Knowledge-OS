import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

// Prisma returns BigInt columns (e.g. Document.sizeBytes) as JS `bigint`, which
// JSON.stringify can't serialize by default. Values here stay well under
// Number.MAX_SAFE_INTEGER, so stringifying is safe.
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
