import { Injectable } from '@nestjs/common';
import { AiPort, AiUnavailableError } from './ai.port';

@Injectable()
export class NullAiAdapter implements AiPort {
  readonly isAvailable = false;

  async chatComplete(): Promise<string> {
    throw new AiUnavailableError();
  }
}
