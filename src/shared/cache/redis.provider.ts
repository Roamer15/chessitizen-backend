import { Provider } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_PROVIDER = 'REDIS';

export const RedisProvider: Provider = {
  provide: REDIS_PROVIDER,
  useFactory: () => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    return new Redis(redisUrl, {
      // For Redis Cloud, you need TLS
      tls: redisUrl.includes('rediss://') ? {} : undefined,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      maxRetriesPerRequest: 3,
    });
  },
};
