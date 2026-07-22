import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisConnection } from './redis-connection';
import { QueuePort } from './queue.port';

@Injectable()
export class BullMqQueueAdapter implements QueuePort, OnModuleDestroy {
  private readonly connection = createRedisConnection();
  private readonly queues = new Map<string, Queue>();

  async enqueue<T>(queueName: string, payload: T): Promise<void> {
    await this.getQueue(queueName).add(queueName, payload);
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
