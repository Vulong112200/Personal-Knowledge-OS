import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import { createRedisConnection } from './redis-connection';
import { EnqueueOptions, QueuePort } from './queue.port';

// Retry transient failures (storage/DB blips) instead of permanently failing a document on
// the first error, and evict finished jobs so Redis doesn't grow unbounded on Upstash.
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600 },
  removeOnFail: { age: 86400 },
};

@Injectable()
export class BullMqQueueAdapter implements QueuePort, OnModuleDestroy {
  private readonly connection = createRedisConnection();
  private readonly queues = new Map<string, Queue>();

  async enqueue<T>(queueName: string, payload: T, opts?: EnqueueOptions): Promise<void> {
    await this.getQueue(queueName).add(queueName, payload, {
      ...DEFAULT_JOB_OPTIONS,
      jobId: opts?.jobId,
    });
  }

  private getQueue(queueName: string): Queue {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, { connection: this.connection });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  async onModuleDestroy() {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.connection.disconnect();
  }
}
