import OpenAI from 'openai';
import { AiPort, ChatMessage } from './ai.port';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter's free-tier model catalog changes over time (models get moved to
// paid-only or removed) — override via OPENROUTER_MODEL if this one stops working.
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';

export class OpenRouterAdapter implements AiPort {
  readonly isAvailable = true;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL) {
    this.client = new OpenAI({ apiKey, baseURL: OPENROUTER_BASE_URL });
    this.model = model;
  }

  async chatComplete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.1,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
