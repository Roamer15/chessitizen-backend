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
   * Player joins a game room
   */
  @SubscribeMessage('joinGame')
  async handleJoinGame(@MessageBody() gameId: string, @ConnectedSocket() client: Socket) {
    await client.join(gameId);
    this.server.to(gameId).emit('playerJoined', { playerId: client.id });
  }

  /**
   * Start a new game vs AI
   */
  @SubscribeMessage('startGame')
  async handleStartGame(@MessageBody() dto: StartGameDto, @ConnectedSocket() client: Socket) {
    // Assumes a WS auth guard/middleware attaches the JWT payload to client.data.user
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const userId = client.data?.user?.sub as string;
    if (!userId) {
      throw new WsException('Unauthenticated socket');
    }
    const game = await this.gameService.makeMove(data.gameId, userId, data.dto);
    // client.emit('moveMade', game);
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
    const game = await this.gameService.endGame(data.gameId, validatedReason, validatedWinner);
    client.emit('gameEnded', game);
    this.server.to(game._id.toString()).emit('gameEnded', game);
  }

  //PVP event
  emitGameUpdate(gameId: string, payload: any) {
    this.server.to(gameId).emit('gameUpdate', payload);
  }
}
