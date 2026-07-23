export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export class AiUnavailableError extends Error {
  constructor() {
    super('AI is not enabled or configured for this workspace');
  }
}

export interface AiPort {
  readonly isAvailable: boolean;
  chatComplete(messages: ChatMessage[]): Promise<string>;
}

export const AI_PORT = Symbol('AI_PORT');
