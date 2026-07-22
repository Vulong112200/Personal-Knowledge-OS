export interface QueuePort {
  enqueue<T>(queueName: string, payload: T): Promise<void>;
}

export const QUEUE_PORT = Symbol('QUEUE_PORT');
