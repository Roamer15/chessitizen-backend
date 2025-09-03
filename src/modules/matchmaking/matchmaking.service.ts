import {
  Injectable,
  type OnModuleInit,
  type OnModuleDestroy,
  Inject,
  forwardRef,
  Logger,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Socket } from 'socket.io';
import { GameService } from '../game/game.service';

interface MatchmakingUser {
  userId: string;
  socketId: string; // Store socket ID instead of socket object
  rating: number;
  createdAt: number; // Use timestamp instead of Date object
}

@Injectable()
export class MatchmakingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MatchmakingService.name); // Added logger
  private readonly MATCHMAKING_QUEUE = 'chess:matchmaking:queue';
  private readonly MATCHMAKING_TIMEOUT = 90000; // 30 seconds
  private readonly SOCKET_MAP = new Map<string, Socket>(); // Store sockets separately
  private cleanupInterval: NodeJS.Timeout; // Added cleanup interval
  private matchingInProgress = false; // Prevent race conditions

  constructor(
    @Inject('REDIS') private readonly redis: Redis,
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
  ) {}

  async onModuleInit() {
    // Clean up any stale queue entries on startup
    await this.redis.del(this.MATCHMAKING_QUEUE);

    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleEntries().catch((error) => this.logger.error('Cleanup failed:', error));
    }, 10000); // Every 10 seconds
  }

  async onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    await this.redis.del(this.MATCHMAKING_QUEUE);
    this.SOCKET_MAP.clear();
  }

  // Add player to matchmaking queue
  async addToQueue(userId: string, socket: Socket, rating = 1200): Promise<void> {
    if (!userId || !socket || rating < 0 || rating > 5000) {
      throw new Error('Invalid input parameters');
    }

    try {
      this.SOCKET_MAP.set(socket.id, socket);

      const userData: MatchmakingUser = {
        userId,
        socketId: socket.id,
        rating,
        createdAt: Date.now(),
      };

      // Store in Redis sorted set (using rating as score)
      await this.redis.zadd(this.MATCHMAKING_QUEUE, rating, JSON.stringify(userData));

      // Set expiration to prevent stale entries
      await this.redis.expire(this.MATCHMAKING_QUEUE, this.MATCHMAKING_TIMEOUT / 1000);

      this.logger.log(`Player ${userId} added to queue with rating ${rating}`);

      // Start matchmaking process
      await this.tryMatchPlayers();
    } catch (error) {
      this.logger.error(`Failed to add player ${userId} to queue:`, error);
      throw error;
    }
  }

  // Remove player from queue
  async removeFromQueue(userId: string): Promise<void> {
    try {
      const queue = await this.redis.zrange(this.MATCHMAKING_QUEUE, 0, -1);

      for (const userJson of queue) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const user: MatchmakingUser = JSON.parse(userJson);
        if (user.userId === userId) {
          await this.redis.zrem(this.MATCHMAKING_QUEUE, userJson);
          this.SOCKET_MAP.delete(user.socketId);
          this.logger.log(`Player ${userId} removed from queue`);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Failed to remove player ${userId} from queue:`, error);
    }
  }

  async handleSocketDisconnect(socketId: string): Promise<void> {
    try {
      const queue = await this.redis.zrange(this.MATCHMAKING_QUEUE, 0, -1);

      for (const userJson of queue) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const user: MatchmakingUser = JSON.parse(userJson);
        if (user.socketId === socketId) {
          await this.redis.zrem(this.MATCHMAKING_QUEUE, userJson);
          this.logger.log(`Player with socket ${socketId} removed due to disconnect`);
          break;
        }
      }

      this.SOCKET_MAP.delete(socketId);
    } catch (error) {
      this.logger.error(`Failed to handle socket disconnect ${socketId}:`, error);
    }
  }

  // Match players based on rating proximity
  private async tryMatchPlayers(): Promise<void> {
    if (this.matchingInProgress) {
      return;
    }

    this.matchingInProgress = true;

    try {
      const queue = await this.getQueue();

      if (queue.length < 2) return;

      // Sort by rating and creation time
      queue.sort((a, b) => a.rating - b.rating || a.createdAt - b.createdAt);

      for (let i = 0; i < queue.length - 1; i++) {
        const player1 = queue[i];
        const player2 = queue[i + 1];

        const socket1 = this.SOCKET_MAP.get(player1.socketId);
        const socket2 = this.SOCKET_MAP.get(player2.socketId);

        if (!socket1 || !socket2) {
          // Clean up disconnected players
          if (!socket1) await this.removeFromQueue(player1.userId);
          if (!socket2) await this.removeFromQueue(player2.userId);
          continue;
        }

        // Match if ratings are within 200 points or both have been waiting >15s
        const ratingDiff = Math.abs(player1.rating - player2.rating);
        const waitTime = Date.now() - Math.max(player1.createdAt, player2.createdAt);

        if (ratingDiff <= 200 || waitTime > 15000) {
          await this.createMatch(player1, player2, socket1, socket2);

          // Remove matched players from queue
          await this.removeFromQueue(player1.userId);
          await this.removeFromQueue(player2.userId);

          break;
        }
      }
    } catch (error) {
      this.logger.error('Error in tryMatchPlayers:', error);
    } finally {
      this.matchingInProgress = false;
    }
  }

  // Create a game match
  private async createMatch(
    player1: MatchmakingUser,
    player2: MatchmakingUser,
    socket1: Socket,
    socket2: Socket,
  ): Promise<void> {
    try {
      // Create multiplayer game (random color assignment)
      const randomColor = Math.random() > 0.5 ? 'white' : 'black';

      const game = await this.gameService.createMultiplayerGame(
        randomColor === 'white' ? player1.userId : player2.userId,
        randomColor === 'white' ? player2.userId : player1.userId,
      );

      // Notify both players
      socket1.emit('matchFound', {
        gameId: game._id.toString(),
        color: randomColor === 'white' ? 'white' : 'black',
        opponent: {
          id: player2.userId,
          rating: player2.rating,
        },
      });

      socket2.emit('matchFound', {
        gameId: game._id.toString(),
        color: randomColor === 'white' ? 'black' : 'white',
        opponent: {
          id: player1.userId,
          rating: player1.rating,
        },
      });

      this.logger.log(`Match created between ${player1.userId} and ${player2.userId}`);
    } catch (error) {
      this.logger.error('Match creation failed:', error);
      try {
        await this.addToQueue(player1.userId, socket1, player1.rating);
        await this.addToQueue(player2.userId, socket2, player2.rating);
      } catch (reAddError) {
        this.logger.error('Failed to re-add players to queue:', reAddError);
      }
    }
  }

  // Get current queue with parsed data
  private async getQueue(): Promise<MatchmakingUser[]> {
    try {
      const queue = await this.redis.zrange(this.MATCHMAKING_QUEUE, 0, -1);
      return queue.map((userJson) => JSON.parse(userJson) as MatchmakingUser);
    } catch (error) {
      this.logger.error('Failed to get queue:', error);
      return [];
    }
  }

  // Get queue statistics
  async getQueueStats(): Promise<{
    totalPlayers: number;
    averageRating: number;
    waitTimes: number[];
  }> {
    try {
      const queue = await this.getQueue();
      const now = Date.now();

      return {
        totalPlayers: queue.length,
        averageRating: queue.reduce((sum, user) => sum + user.rating, 0) / queue.length || 0,
        waitTimes: queue.map((user) => now - user.createdAt),
      };
    } catch (error) {
      this.logger.error('Failed to get queue stats:', error);
      return { totalPlayers: 0, averageRating: 0, waitTimes: [] };
    }
  }

  // Clean up stale entries (call this periodically)
  async cleanupStaleEntries(): Promise<void> {
    try {
      const queue = await this.getQueue();
      const now = Date.now();

      for (const user of queue) {
        const socket = this.SOCKET_MAP.get(user.socketId);

        // Remove if socket is disconnected or entry is stale
        if (!socket || !socket.connected || now - user.createdAt > this.MATCHMAKING_TIMEOUT) {
          if (socket) {
            socket.emit('matchmakingTimeout');
          }
          await this.removeFromQueue(user.userId);
          this.logger.log(`Cleaned up stale entry for user ${user.userId}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stale entries:', error);
    }
  }
}
