export type EmbeddingKind = 'query' | 'passage';

export interface EmbeddingPort {
  readonly isAvailable: boolean;
  readonly dimensions: number;
  readonly model: string;
  /** Embed a batch of texts. `kind` lets asymmetric models (e.g. e5) prefix query vs. passage. */
  embed(texts: string[], kind: EmbeddingKind): Promise<number[][]>;
}

export const EMBEDDING_PORT = Symbol('EMBEDDING_PORT');
