// import { Module, Global } from '@nestjs/common';
// import { CacheModule } from '@nestjs/cache-manager';
// import * as redisStore from 'cache-manager-redis-store';
// import { RedisService } from './redis.service';

// @Global()
// @Module({
//   imports: [
//     CacheModule.register({
//       store: redisStore,
//       socket: {
//         host: '127.0.0.1',
//         port: 6379,
//       },
//       ttl: 300,
//     }),
//   ],
//   providers: [RedisService],
//   exports: [RedisService, CacheModule],
// })
// export class RedisModule {}

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
        return new Keyv({
          store: new KeyvRedis('redis://127.0.0.1:6379'),
        });
      },
    },
    RedisService,
  ],
  exports: ['REDIS_CLIENT', RedisService],
})
export class RedisModule {}
