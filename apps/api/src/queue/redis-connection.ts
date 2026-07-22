import IORedis from 'ioredis';

// Upstash (and BullMQ generally) requires these two options — BullMQ issues blocking
// commands that Upstash's proxy doesn't ack the way ioredis expects by default.
export function createRedisConnection(): IORedis {
  return new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
