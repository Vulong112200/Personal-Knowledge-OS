import { Global, Logger, Module } from '@nestjs/common';
import { AI_PORT } from './ai.port';
import { NullAiAdapter } from './null-ai.adapter';
import { OpenRouterAdapter } from './openrouter.adapter';

const logger = new Logger('AiModule');

@Global()
@Module({
  providers: [
    {
      provide: AI_PORT,
      useFactory: () => {
        const enabled = process.env.AI_ENABLED === 'true';
        const apiKey = process.env.OPENROUTER_API_KEY;

        if (enabled && apiKey) {
          logger.log('AI enabled — using OpenRouterAdapter');
          return new OpenRouterAdapter(apiKey);
        }
        if (enabled && !apiKey) {
          logger.warn('AI_ENABLED=true but OPENROUTER_API_KEY is missing — falling back to NullAiAdapter');
        }
        return new NullAiAdapter();
      },
    },
  ],
  exports: [AI_PORT],
})
export class AiModule {}
