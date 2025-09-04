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
import { Game } from 'src/schema/game.schema';

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
    @MessageBody() gameId: string | null,
    @ConnectedSocket() client: Socket,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    try {
      const game: Game = gameId
        ? await this.gameService.joinGame(gameId, userId)
        : await this.gameService.autoJoinOrCreate(userId);

      const gameRoom = game._id.toString(); // always stringify

      // Join the socket to the game room
      if (!client.rooms.has(gameRoom)) {
        await client.join(gameRoom);
      }

      // Notify the joining client
      client.emit('gameJoined', {
        gameId: gameRoom,
        game,
        message: gameId
          ? `Player ${userId} joined the game.`
          : game.gameStatus === GameStatus.WAITING
            ? 'Waiting for an opponent...'
            : 'Game started!',
      });

      // Notify all players in the room (including self)
      this.server.to(gameRoom).emit('playerJoined', {
        game,
        player: userId,
        message: `Player ${userId} joined the game.`,
      });

      // ✅ Emit gameStarted if both players are present
      if (game.isMultiplayer && game.whitePlayer && game.blackPlayer) {
        this.logger.log(`Emitting gameStarted for multiplayer game ${game._id}`);
        this.server.to(gameRoom).emit('gameStarted', game);
      }

      return game;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Unable to join game';
      this.logger.error(
        `joinMultiplayerGame failed for ${userId}: ${errMsg}`,
        error instanceof Error ? error.stack : undefined,
      );
      client.emit('joinError', { gameId, message: errMsg });
    }
  }
  /**
   * Start a new game (vs AI or multiplayer)
   */
  @SubscribeMessage('startGame')
  async handleStartGame(@MessageBody() dto: StartGameDto, @ConnectedSocket() client: Socket) {
    this.logger.log(`WebSocket startGame called - ClientID: ${client.id}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    const game = await this.gameService.startGame(userId, dto);
    await client.join(game._id.toString());

    if (game.isMultiplayer) {
      // Ensure inviteCode exists
      if (!game.inviteCode) {
        const inviteLinkObj = await this.gameService.generateInviteLink(game._id);
        // `generateInviteLink` returns an object, extract code from inviteLink string
        const inviteCode = inviteLinkObj.inviteLink.split('/').pop();
        game.inviteCode = inviteCode;
        await game.save();
      }

      // Emit both options: direct join OR invite-based join
      this.server.to(game._id.toString()).emit('gameWaiting', {
        gameId: game._id,
        inviteCode: game.inviteCode, // use this for invite-based join
        message: 'Game created. Another player can join directly or via invite link.',
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    await client.join(data.gameId);
    const game = await this.gameService.makeMove(data.gameId, userId, data.dto);

    // Broadcast move to both players
    this.server.to(game._id.toString()).emit('moveMade', {
      gameId: game._id,
      move: data.dto,
      fen: game.currentFen, // new board state
      game,
    });

    // ✅ If game ended, notify both players
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
  async handleResetBoard(
    @MessageBody() data: { gameId: string },
    @ConnectedSocket() client: Socket,
  ) {
    this.logger.log(`WebSocket resetBoard called - GameID: ${data.gameId}, ClientID: ${client.id}`);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    await client.join(data.gameId);
    const game = await this.gameService.resetBoard(data.gameId);
    this.server.to(game._id.toString()).emit('moveMade', game);
    this.server.to(game._id.toString()).emit('boardReset', game);
    this.logger.log(`Board reset for game ${data.gameId}`);
  }

  /**
   * Broadcast game updates (used by GameService)
   */
  emitGameUpdate(gameId: string, payload: any) {
    this.server.to(gameId).emit('moveMade', payload);
  }

  @SubscribeMessage('joinByInvite')
  async handleJoinByInvite(
    @MessageBody() data: { inviteCode: string },
    @ConnectedSocket() client: Socket,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) throw new WsException('Unauthenticated socket');

    const game = await this.gameService.joinByInviteCode(data.inviteCode, userId);
    await client.join(game._id.toString());

    this.server.to(game._id.toString()).emit('playerJoined', { userId });

    return game;
  }
}
