// game.gateway.ts
import { forwardRef, Inject, UseGuards } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { LoggerService } from 'src/logger/logger.service';
import { MakeMoveDto } from 'src/modules/game/dto/make-move.dto';
import { StartGameDto } from 'src/modules/game/dto/start-game.dto';
import { GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';
import { WsAuthGuard } from './guard/ws-auth.guard';
import { GameService } from '../modules/game/game.service';
import { MatchmakingService } from 'src/modules/matchmaking/matchmaking.service';

interface Move {
  from: string;
  to: string;
  fen: string;
  san?: string;
  timestamp?: Date;
}

interface GameData {
  gameId: string;
  moves: Move[];
  fen: string;
}

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:8081',
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
  },
})
@UseGuards(WsAuthGuard)
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy {
  @WebSocketServer()
  server: Server;

  private connectedPlayers: Map<string, { userId: string; socket: Socket }> = new Map();
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
    @Inject(forwardRef(() => MatchmakingService))
    private readonly matchMaking: MatchmakingService,
    private readonly logger: LoggerService,
  ) {
    this.cleanupInterval = setInterval(() => {
      void (async () => {
        try {
          await this.matchMaking.cleanupStaleEntries();
        } catch (error) {
          console.error('Cleanup failed:', error);
        }
      })();
    }, 30000);
  }

  // class GameGateway implements ..., OnModuleDestroy
  onModuleDestroy() {
    if (this.cleanupInterval) clearInterval(this.cleanupInterval);
  }

  private setupConnectionMonitoring(): void {
    // Ping clients periodically to check connection
    setInterval(() => {
      this.connectedPlayers.forEach((player) => {
        player.socket.emit('ping', { timestamp: Date.now() });
      });
    }, 15000); // Every 15 seconds

    // Handle pong responses
    this.server.on('connection', (socket) => {
      socket.on('pong', (data) => {
        // Update last seen timestamp for this connection
        this.logger.debug(`Client ${socket.id} is alive: ${data}`);
      });
    });
  }

  afterInit() {
    this.setupConnectionMonitoring();
  }

  handleConnection(client: Socket) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub;
    if (userId) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      this.connectedPlayers.set(client.id, { userId, socket: client });
      this.logger.log(`Player ${userId} connected with socket ${client.id}`);
    }
  }

  async handleDisconnect(client: Socket) {
    const playerInfo = this.connectedPlayers.get(client.id);
    if (playerInfo) {
      this.connectedPlayers.delete(client.id);
      this.logger.log(`Player ${playerInfo.userId} disconnected`);
      await this.handlePlayerDisconnect(playerInfo.userId);
    }
  }

  private async handlePlayerDisconnect(userId: string): Promise<void> {
    try {
      // Find all games where this player is active
      const activeGames = await this.gameService.findActiveGamesByUser(userId);

      for (const game of activeGames) {
        if (game.gameStatus === GameStatus.ONGOING) {
          // Handle disconnect in multiplayer games
          if (!game.vsAI) {
            const opponentId =
              game.whitePlayer?.toString() === userId
                ? game.blackPlayer?.toString()
                : game.whitePlayer?.toString();

            if (opponentId) {
              // Notify opponent about disconnect
              this.server.to(game._id.toString()).emit('playerDisconnected', {
                disconnectedPlayer: userId,
                gameId: game._id.toString(),
              });

              // Auto-resign after timeout or implement pause logic
              setTimeout(() => {
                void (async () => {
                  try {
                    const currentGame = await this.gameService.getGame(game._id.toString());
                    if (currentGame.gameStatus === GameStatus.ONGOING) {
                      const resignedGame = await this.gameService.endGame(
                        game._id.toString(),
                        ResultReason.RESIGNATION,
                        opponentId as Winner,
                      );
                      this.server.to(game._id.toString()).emit('gameEnded', resignedGame);
                    }
                  } catch (error) {
                    console.error('Auto-resign failed:', error);
                  }
                })();
              }, 30000);
            }
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.logger.error('Error handling player disconnect:', error.message);
      } else {
        this.logger.error('Unknown error occurred during disconnect handling');
      }
    }
  }

  /**
   * Player joins a game room
   */
  @SubscribeMessage('joinGame')
  async handleJoinGame(@MessageBody() gameId: string, @ConnectedSocket() client: Socket) {
    this.logger.log(`WebSocket joinGame called - GameID: ${gameId}, ClientID: ${client.id}`);
    await client.join(gameId);
    this.server.to(gameId).emit('playerJoined', { playerId: client.id });
  }

  /**
   * Start a new game vs AI
   */
  @SubscribeMessage('startGame')
  async handleStartGame(@MessageBody() dto: StartGameDto, @ConnectedSocket() client: Socket) {
    // Assumes a WS auth guard/middleware attaches the JWT payload to client.data.user
    this.logger.log(`WebSocket startGame called - ClientID: ${client.id}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }
    const game = await this.gameService.startGame(userId, dto);
    await client.join(game._id.toString());
    // client.emit('gameStarted', game);
    this.logger.log(`Emitting gameStarted for ${game._id} to room`);
    this.server.to(game._id.toString()).emit('gameStarted', game);
  }

  /**
   * Handle player moves
   */
  @SubscribeMessage('makeMove')
  async handleMakeMove(
    @MessageBody() data: { gameId: string; dto: MakeMoveDto },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `WebSocket makeMove received - GameID: ${data.gameId}, ClientID: ${client.id}, Move: ${JSON.stringify(data.dto)}`,
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }
    await client.join(data.gameId);
    const game = await this.gameService.makeMove(data.gameId, userId, data.dto);
    // Broadcast updated game state to everyone in the room
    this.server.to(game._id.toString()).emit('moveMade', game);

    // if game ended, notify all players
    if (game.gameStatus === GameStatus.ENDED) {
      this.server.to(game._id.toString()).emit('gameEnded', game);
    }
  }

  /**
   * End game manually (abort/timeout/etc)
   */
  @SubscribeMessage('endGame')
  async handleEndGame(
    @MessageBody() data: { gameId: string; reason: string; winner: string },
    @ConnectedSocket() client: Socket,
  ) {
    if (!Object.values(ResultReason).includes(data.reason as ResultReason)) {
      throw new WsException(`Invalid reason: ${data.reason}`);
    }
    if (!Object.values(Winner).includes(data.winner as Winner)) {
      throw new WsException(`Invalid winner: ${data.winner}`);
    }

    const validatedReason = data.reason as ResultReason;
    const validatedWinner = data.winner as Winner;

    await client.join(data.gameId);
    const game = await this.gameService.endGame(data.gameId, validatedReason, validatedWinner);
    // client.emit('gameEnded', game);
    this.server.to(game._id.toString()).emit('gameEnded', game);
  }

  /**
   * Reset the chess board to original starting position
   */
  @SubscribeMessage('resetBoard')
  async handleResetBoard(client: Socket, data: { gameId: string }) {
    this.logger.log(`WebSocket resetBoard called - GameID: ${data.gameId}, ClientID: ${client.id}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }

    await client.join(data.gameId);
    const game = await this.gameService.resetBoard(data.gameId);

    // Broadcast the reset board state to all clients in the room
    this.server.to(game._id.toString()).emit('boardReset', game);
    this.logger.log(`Board reset for game ${data.gameId}`);
  }

  /**
   * Undo a move when playing against Ai
   */
  @SubscribeMessage('undoMove')
  async handleUndoMove(client: Socket, data: { gameId: string }) {
    this.logger.log(`WebSocket makeMove received - GameID: ${data.gameId}, ClientID: ${client.id}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }
    await client.join(data.gameId);
    const game = await this.gameService.undoMove(data.gameId, userId);

    this.server.to(game._id.toString()).emit('moveUndone', game);
    this.logger.log(`Move undone successfully`);
  }

  @SubscribeMessage('getHistory')
  async handleGameHistory(client: Socket, data: { gameId: string }) {
    this.logger.log('Retrieveing game history');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }
    await client.join(data.gameId);
    const game = await this.gameService.getMoveHistory(data.gameId);
    const moves = game.moves;
    this.server.to(game._id.toString()).emit('gameHistory', moves);
  }

  //Multiplayer operations
  @SubscribeMessage('findOpponent')
  async handleFindOpponent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string; rating?: number },
  ) {
    try {
      await this.matchMaking.addToQueue(data.userId, client, data.rating || 1200);
      client.emit('matchmakingStarted');
    } catch (error: unknown) {
      if (error instanceof Error) {
        client.emit('matchmakingError', { error: error.message });
      } else {
        client.emit('matchmakingError', { error: 'Something went wrong' });
      }
    }
  }

  @SubscribeMessage('cancelMatchmaking')
  async handleCancelMatchmaking(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { userId: string },
  ) {
    await this.matchMaking.removeFromQueue(data.userId);
    client.emit('matchmakingCancelled');
  }

  @SubscribeMessage('getQueueStats')
  async handleGetQueueStats(@ConnectedSocket() client: Socket) {
    const stats = await this.matchMaking.getQueueStats();
    client.emit('queueStats', stats);
  }

  //PVP event
  emitGameUpdate(gameId: string, payload: GameData) {
    this.server.to(gameId).emit('gameUpdate', payload);
    // Also emit aiMoveMade for compatibility with client expectations
    this.server.to(gameId).emit('aiMoveMade', {
      gameId: payload.gameId,
      move: payload.moves[payload.moves.length - 1], // Last move
      fen: payload.fen,
      explanation: 'AI move completed',
    });
  }
}
