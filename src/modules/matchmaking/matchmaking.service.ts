// matchmaking/redis-matchmaking.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { Socket } from 'socket.io';
import { GameService } from '../game/game.service';

interface MatchmakingUser {
  userId: string;
  socket: Socket;
  rating: number;
  createdAt: Date;
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly MATCHMAKING_QUEUE = 'chess:matchmaking:queue';
  private readonly MATCHMAKING_TIMEOUT = 30000; // 30 seconds

  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    private readonly gameService: GameService,
  ) {}

  async onModuleInit() {
    // Clean up any stale queue entries on startup
    await this.redis.del(this.MATCHMAKING_QUEUE);
  }

  async onModuleDestroy() {
    await this.redis.del(this.MATCHMAKING_QUEUE);
  }

  // Add player to matchmaking queue
  async addToQueue(userId: string, socket: Socket, rating: number = 1200): Promise<void> {
    const userData: MatchmakingUser = {
      userId,
      socket,
      rating,
      createdAt: new Date(),
    };

    // Store in Redis sorted set (using rating as score)
    await this.redis.zadd(this.MATCHMAKING_QUEUE, rating, JSON.stringify(userData));

    // Set expiration to prevent stale entries
    await this.redis.expire(this.MATCHMAKING_QUEUE, this.MATCHMAKING_TIMEOUT / 1000);

    // Start matchmaking process
    await this.tryMatchPlayers();
  }

  // Remove player from queue
  async removeFromQueue(userId: string): Promise<void> {
    const queue = await this.redis.zrange(this.MATCHMAKING_QUEUE, 0, -1);

    for (const userJson of queue) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const user: MatchmakingUser = JSON.parse(userJson);
      if (user.userId === userId) {
        await this.redis.zrem(this.MATCHMAKING_QUEUE, userJson);
        break;
      }
    }
  }

  // Match players based on rating proximity
  private async tryMatchPlayers(): Promise<void> {
    const queue = await this.getQueue();

    if (queue.length < 2) return;

    // Sort by rating and creation time
    queue.sort((a, b) => a.rating - b.rating || a.createdAt.getTime() - b.createdAt.getTime());

    for (let i = 0; i < queue.length - 1; i++) {
      const player1 = queue[i];
      const player2 = queue[i + 1];

      // Match if ratings are within 200 points or both have been waiting >15s
      const ratingDiff = Math.abs(player1.rating - player2.rating);
      const waitTime =
        Date.now() - Math.max(player1.createdAt.getTime(), player2.createdAt.getTime());

      if (ratingDiff <= 200 || waitTime > 15000) {
        await this.createMatch(player1, player2);

        // Remove matched players from queue
        await this.removeFromQueue(player1.userId);
        await this.removeFromQueue(player2.userId);

        break;
      }
    }
  }

  // Create a game match
  private async createMatch(player1: MatchmakingUser, player2: MatchmakingUser): Promise<void> {
    try {
      // Create multiplayer game (random color assignment)
      const randomColor = Math.random() > 0.5 ? 'white' : 'black';

      const game = await this.gameService.createMultiplayerGame(
        randomColor === 'white' ? player1.userId : player2.userId,
        randomColor === 'white' ? player2.userId : player1.userId,
      );

      // Notify both players
      player1.socket.emit('matchFound', {
        gameId: game._id.toString(),
        color: randomColor === 'white' ? 'white' : 'black',
        opponent: {
          id: player2.userId,
          rating: player2.rating,
        },
      });

      player2.socket.emit('matchFound', {
        gameId: game._id.toString(),
        color: randomColor === 'white' ? 'black' : 'white',
        opponent: {
          id: player1.userId,
          rating: player1.rating,
        },
      });
    } catch (error) {
      console.error('Match creation failed:', error);
      // Re-add players to queue if match fails
      await this.addToQueue(player1.userId, player1.socket, player1.rating);
      await this.addToQueue(player2.userId, player2.socket, player2.rating);
    }
  }

  // Get current queue with parsed data
  private async getQueue(): Promise<MatchmakingUser[]> {
    const queue = await this.redis.zrange(this.MATCHMAKING_QUEUE, 0, -1);
    return queue.map((userJson) => JSON.parse(userJson) as MatchmakingUser);
  }

  // Get queue statistics
  async getQueueStats(): Promise<{
    totalPlayers: number;
    averageRating: number;
    waitTimes: number[];
  }> {
    const queue = await this.getQueue();
    const now = Date.now();

    return {
      totalPlayers: queue.length,
      averageRating: queue.reduce((sum, user) => sum + user.rating, 0) / queue.length || 0,
      waitTimes: queue.map((user) => now - user.createdAt.getTime()),
    };
  }

  // Clean up stale entries (call this periodically)
  async cleanupStaleEntries(): Promise<void> {
    const queue = await this.getQueue();
    const now = Date.now();

    for (const user of queue) {
      if (now - user.createdAt.getTime() > this.MATCHMAKING_TIMEOUT) {
        user.socket.emit('matchmakingTimeout');
        await this.removeFromQueue(user.userId);
      }
    }
  }
}
