import { Module, Global } from '@nestjs/common';
import { RedisService } from './redis.service';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_CLIENT',
      useFactory: () => {
        const host = process.env.REDIS_HOST || '127.0.0.1';
        const port = process.env.REDIS_PORT || '6379';
        const password = process.env.REDIS_PASSWORD || null;

        // redis://[:password@]host:port
        const redisUrl = password
          ? `redis://:${password}@${host}:${port}`
          : `redis://${host}:${port}`;

        return new Keyv({
          store: new KeyvRedis(redisUrl),
        });
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
