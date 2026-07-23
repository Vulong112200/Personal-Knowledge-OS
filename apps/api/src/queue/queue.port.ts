export interface EnqueueOptions {
  /** Stable id for deduping enqueues — BullMQ ignores an add() whose jobId already exists. */
  jobId?: string;
}

export interface QueuePort {
  enqueue<T>(queueName: string, payload: T, opts?: EnqueueOptions): Promise<void>;
}

export const QUEUE_PORT = Symbol('QUEUE_PORT');
