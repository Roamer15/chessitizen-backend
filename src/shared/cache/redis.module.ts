// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { RedisService } from './redis.service';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      ttl: 300,
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule], // Export the service instead of CacheModule
})
export class RedisModule {}
