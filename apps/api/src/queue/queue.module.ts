import { Global, Module } from '@nestjs/common';
import { QUEUE_PORT } from './queue.port';
import { BullMqQueueAdapter } from './bullmq-queue.adapter';

@Global()
@Module({
  providers: [{ provide: QUEUE_PORT, useClass: BullMqQueueAdapter }],
  exports: [QUEUE_PORT],
})
export class QueueModule {}
