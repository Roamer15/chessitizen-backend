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
import { Server, Socket } from 'socket.io';
import { LoggerService } from 'src/logger/logger.service';
import { MakeMoveDto } from 'src/modules/game/dto/make-move.dto';
import { StartGameDto } from 'src/modules/game/dto/start-game.dto';
import { GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';
import { WsAuthGuard } from './guard/ws-auth.guard';
import { GameService } from '../modules/game/game.service';

@WebSocketGateway({
  cors: { origin: '*' }, // adjust for production
})
@UseGuards(WsAuthGuard)
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
    private readonly logger: LoggerService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Legacy: Player joins a game room (works for AI or multiplayer spectators)
   */
  @SubscribeMessage('joinGame')
  async handleJoinGame(@MessageBody() gameId: string, @ConnectedSocket() client: Socket) {
    this.logger.log(`[v0] WebSocket joinGame called - GameID: ${gameId}, ClientID: ${client.id}`);
    await client.join(gameId);
    this.server.to(gameId).emit('playerJoined', { playerId: client.id });
  }

  /**
   * Player joins a multiplayer game as the second player
   */
  @SubscribeMessage('joinMultiplayerGame')
  async handleJoinMultiplayerGame(
    @MessageBody() gameId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(
      `[v1] WebSocket joinMultiplayerGame called - GameID: ${gameId}, ClientID: ${client.id}`,
    );

    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    if (!client.rooms.has(gameId)) {
      await client.join(gameId);
    }

    const game = await this.gameService.joinGame(gameId, userId);

    this.server.to(gameId).emit('playerJoined', {
      game,
      player: userId,
      message: `Player ${userId} joined the game.`,
    });
  }

  /**
   * Start a new game (vs AI or multiplayer)
   */
  @SubscribeMessage('startGame')
  async handleStartGame(@MessageBody() dto: StartGameDto, @ConnectedSocket() client: Socket) {
    this.logger.log(`[v1] WebSocket startGame called - ClientID: ${client.id}`);
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    const game = await this.gameService.startGame(userId, dto);
    await client.join(game._id.toString());

    if (game.isMultiplayer) {
      this.server.to(game._id.toString()).emit('gameWaiting', {
        gameId: game._id,
        message: 'Game created, waiting for another player to join.',
      });
    } else {
      this.logger.log(`Emitting gameStarted for ${game._id} to room`);
      this.server.to(game._id.toString()).emit('gameStarted', game);
    }
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

    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    await client.join(data.gameId);
    const game = await this.gameService.makeMove(data.gameId, userId, data.dto);

    // Service already broadcasts updates via emitGameUpdate
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
    this.server.to(game._id.toString()).emit('gameEnded', game);
  }

  /**
   * Reset the chess board to original starting position
   */
  @SubscribeMessage('resetBoard')
  async handleResetBoard(@MessageBody() data: { gameId: string }, @ConnectedSocket() client: Socket) {
    this.logger.log(`WebSocket resetBoard called - GameID: ${data.gameId}, ClientID: ${client.id}`);
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    await client.join(data.gameId);
    const game = await this.gameService.resetBoard(data.gameId);

    this.server.to(game._id.toString()).emit('boardReset', game);
    this.logger.log(`Board reset for game ${data.gameId}`);
  }

  /**
   * Broadcast game updates (used by GameService)
   */
  emitGameUpdate(gameId: string, payload: any) {
    this.server.to(gameId).emit('moveMade', payload);
  }
}
