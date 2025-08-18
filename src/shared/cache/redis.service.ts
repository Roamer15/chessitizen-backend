// import { Inject, Injectable, Logger } from '@nestjs/common';
// import { CACHE_MANAGER } from '@nestjs/cache-manager';
// import { Cache } from 'cache-manager';
// import { setTimeout } from 'timers/promises';
// import { RedisClientType } from 'redis';
// // import { throwHttpError } from 'src/common/errors/http-exception.helper';
// // import { ErrorCode } from 'src/common/errors/error-codes.enum';

// interface RedisCache extends Cache {
//   store: {
//     getClient: () => RedisClientType;
//   };
// }

// @Injectable()
// export class RedisService {
//   private readonly logger = new Logger(RedisService.name);
//   private readonly MAX_RETRIES = 3;
//   private readonly RETRY_DELAY_MS = 100;

//   constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}
//   private isRedisStore(): boolean {
//     return (
//       this.cache &&
//       'store' in this.cache &&
//       this.cache.store !== null &&
//       typeof this.cache.store === 'object' &&
//       'getClient' in this.cache.store
//     );
//   }

//   // private getClient() {
//   //   return (this.cache as any).store.getClient();
//   // }

//   private async executeWithRetry<T>(operation: string, callback: () => Promise<T>): Promise<T> {
//     let lastError: unknown;

//     for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
//       try {
//         const result = await callback();
//         if (attempt > 1) {
//           this.logger.warn(`Redis ${operation} succeeded after ${attempt} attempts`);
//         }
//         return result;
//       } catch (error) {
//         lastError = error;
//         if (error instanceof Error) {
//           this.logger.error(
//             `Redis ${operation} attempt ${attempt} failed: ${error.message}`,
//             error.stack,
//           );
//         }
//         if (attempt < this.MAX_RETRIES) {
//           await setTimeout(this.RETRY_DELAY_MS * attempt);
//         }
//       }
//     }

//     const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error occurred';
//     this.logger.error(`All retries failed for Redis operation: ${operation}`);

//     throw new Error(`Redis operation failed after ${this.MAX_RETRIES} attempts: ${errorMessage}`);
//     // throwHttpError(ErrorCode.CACHE_ATTEMPT_FAILED);
//   }

//   // private async redisSet<T>(key: string, value: T, ttl?: number): Promise<void> {
//   //   console.log(key, value, ttl);
//   //   // if (this.isRedisStore()) {
//   //   const redisCache = this.cache as RedisCache;
//   //   const client = redisCache.store.getClient();
//   //   // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
//   //   await client.set(key, JSON.stringify(value), 'EX', ttl || 0);
//   // }

//   private async redisSet<T>(key: string, value: T, ttl?: number): Promise<void> {
//     console.log(key, value, ttl);
//     const redisCache = this.cache as RedisCache;
//     const client = redisCache.store.getClient();
//     await client.set(key, JSON.stringify(value), { EX: ttl || 0 });
//   }

//   // OTP Operations
//   async setOtp(email: string, otp: string, ttlSeconds = 300): Promise<void> {
//     console.log(email, otp);
//     this.logger.log(`Setting OTP: ${otp} for email ${email}`);
//     return this.executeWithRetry('setOtp', async () => {
//       await this.redisSet(`otp:${email}`, otp, ttlSeconds);
//       this.logger.debug(`OTP set for ${email} (TTL: ${ttlSeconds}s)`);
//     });
//   }

//   async getOtp(email: string): Promise<string | undefined> {
//     return this.executeWithRetry('getOtp', async () => {
//       const result = await this.cache.get<string>(`otp:${email}`);
//       this.logger.log(result);
//       this.logger.debug(`OTP lookup for ${email}: ${result ? 'found' : 'missing'}`);
//       return result;
//     });
//   }

//   async deleteOtp(email: string): Promise<void> {
//     return this.executeWithRetry('deleteOtp', async () => {
//       await this.cache.del(`otp:${email}`);
//       this.logger.debug(`OTP deleted for ${email}`);
//     });
//   }

//   // Rate Limiting Operations
//   async incrementAttempts(key: string, ttlSeconds = 3600): Promise<number> {
//     return this.executeWithRetry('incrementAttempts', async () => {
//       const attempts = (await this.getAttempts(key)) + 1;
//       await this.redisSet(key, attempts, ttlSeconds);
//       this.logger.debug(`Attempts incremented for ${key}: ${attempts} (TTL: ${ttlSeconds}s)`);
//       return attempts;
//     });
//   }

//   async getAttempts(key: string): Promise<number> {
//     return this.executeWithRetry('getAttempts', async () => {
//       const cached = await this.cache.get<string | number>(key);
//       const attempts = typeof cached === 'number' ? cached : Number(cached) || 0;
//       this.logger.debug(`Current attempts for ${key}: ${attempts}`);
//       return attempts;
//     });
//   }

//   async resetAttempts(key: string): Promise<void> {
//     try {
//       await this.cache.del(key);
//     } catch (error) {
//       console.error(`Error resetting attempts for key ${key}:`, error);
//       throw error;
//     }
//   }

//   // Generic Methods
//   async set<T>(key: string, value: T, ttl?: number): Promise<void> {
//     return this.executeWithRetry('set', async () => {
//       await this.redisSet(key, value, ttl);
//       this.logger.debug(`Cache set for ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
//     });
//   }

//   async get<T>(key: string): Promise<T | undefined> {
//     return this.executeWithRetry('get', async () => {
//       const value = await this.cache.get<T>(key);
//       this.logger.debug(`Cache get for ${key}: ${value ? 'found' : 'missing'}`);
//       return value;
//     });
//   }

//   async del(key: string): Promise<void> {
//     return this.executeWithRetry('del', async () => {
//       await this.cache.del(key);
//       this.logger.debug(`Cache deleted for ${key}`);
//     });
//   }
// }

import { Inject, Injectable, Logger } from '@nestjs/common';
import { setTimeout } from 'timers/promises';
import Keyv from 'keyv';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 100; // ms

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Keyv,
  ) {}

  private async executeWithRetry<T>(operation: string, callback: () => Promise<T>): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const result = await callback();
        if (attempt > 1) {
          this.logger.warn(`Redis ${operation} succeeded after ${attempt} attempts`);
        }
        return result;
      } catch (error) {
        lastError = error;
        if (error instanceof Error) {
          this.logger.error(
            `Redis ${operation} attempt ${attempt} failed: ${error.message}`,
            error.stack,
          );
        }
        if (attempt < this.MAX_RETRIES) {
          await setTimeout(this.RETRY_DELAY_MS * attempt);
        }
      }
    }

    const errorMessage = lastError instanceof Error ? lastError.message : 'Unknown error occurred';
    this.logger.error(`All retries failed for Redis operation: ${operation}`);
    throw new Error(`Redis operation failed after ${this.MAX_RETRIES} attempts: ${errorMessage}`);
  }

  private async redisSet<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.redis.set(key, value, ttl ? ttl * 1000 : undefined); // Keyv TTL is in ms
  }

  // OTP Operations
  async setOtp(email: string, otp: string, ttlSeconds = 300): Promise<void> {
    this.logger.log(`Setting OTP: ${otp} for email ${email}`);
    return this.executeWithRetry('setOtp', async () => {
      await this.redisSet(`otp:${email}`, otp, ttlSeconds);
      this.logger.debug(`OTP set for ${email} (TTL: ${ttlSeconds}s)`);
    });
  }

  async getOtp(email: string): Promise<string | undefined> {
    return this.executeWithRetry('getOtp', async () => {
      const result = await this.redis.get<string>(`otp:${email}`);
      this.logger.debug(`OTP lookup for ${email}: ${result ? 'found' : 'missing'}`);
      return result ?? undefined;
    });
  }

  async deleteOtp(email: string): Promise<void> {
    return this.executeWithRetry('deleteOtp', async () => {
      await this.redis.delete(`otp:${email}`);
      this.logger.debug(`OTP deleted for ${email}`);
    });
  }

  // Rate Limiting Operations
  async incrementAttempts(key: string, ttlSeconds = 3600): Promise<number> {
    return this.executeWithRetry('incrementAttempts', async () => {
      const attempts = (await this.getAttempts(key)) + 1;
      await this.redisSet(key, attempts, ttlSeconds);
      this.logger.debug(`Attempts incremented for ${key}: ${attempts} (TTL: ${ttlSeconds}s)`);
      return attempts;
    });
  }

  async getAttempts(key: string): Promise<number> {
    return this.executeWithRetry('getAttempts', async () => {
      const cached = await this.redis.get<string | number>(key);
      const attempts = typeof cached === 'number' ? cached : Number(cached) || 0;
      this.logger.debug(`Current attempts for ${key}: ${attempts}`);
      return attempts;
    });
  }

  async resetAttempts(key: string): Promise<void> {
    await this.redis.delete(key);
    this.logger.debug(`Attempts reset for ${key}`);
  }

  // Generic Methods
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    return this.executeWithRetry('set', async () => {
      await this.redisSet(key, value, ttl);
      this.logger.debug(`Cache set for ${key}${ttl ? ` (TTL: ${ttl}s)` : ''}`);
    });
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.executeWithRetry('get', async () => {
      const value = await this.redis.get<T>(key);
      this.logger.debug(`Cache get for ${key}: ${value ? 'found' : 'missing'}`);
      return value ?? undefined;
    });
  }

  async del(key: string): Promise<void> {
    return this.executeWithRetry('del', async () => {
      await this.redis.delete(key);
      this.logger.debug(`Cache deleted for ${key}`);
    });
  }
}
