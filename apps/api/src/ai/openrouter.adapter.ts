import OpenAI from 'openai';
import { AiPort, ChatMessage } from './ai.port';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
// OpenRouter's free-tier model catalog changes over time (models get moved to
// paid-only or removed) — override via OPENROUTER_MODEL if this one stops working.
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';
// App-level bounds so a slow/hung free-tier model can't tie up a request for the
// openai SDK's 10-minute default, and a runaway generation can't blow the context budget.
const REQUEST_TIMEOUT_MS = Number(process.env.OPENROUTER_TIMEOUT_MS) || 60_000;
const MAX_TOKENS = Number(process.env.OPENROUTER_MAX_TOKENS) || 1024;

export class OpenRouterAdapter implements AiPort {
  readonly isAvailable = true;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL) {
    this.client = new OpenAI({
      apiKey,
      baseURL: OPENROUTER_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: 2,
    });
    this.model = model;
  }

  async chatComplete(messages: ChatMessage[]): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      temperature: 0.1,
      max_tokens: MAX_TOKENS,
    });
    return response.choices[0]?.message?.content ?? '';
  }
}
