// import { Provider } from '@nestjs/common';
// import Redis from 'ioredis';

// export const REDIS_PROVIDER = 'REDIS';

// export const RedisProvider: Provider = {
//   provide: REDIS_PROVIDER,
//   useFactory: () => {
//     return new Redis({
//       host: process.env.REDIS_HOST || 'localhost',
//       port: parseInt(process.env.REDIS_PORT || '6379'),
//       username: process.env.REDIS_USERNAME || 'default',
//       password: process.env.REDIS_PASSWORD,
//       tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
//     });
//   },
// };
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
