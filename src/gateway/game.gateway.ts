// game.gateway.ts
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { MakeMoveDto } from 'src/modules/game/dto/make-move.dto';
import { StartGameDto } from 'src/modules/game/dto/start-game.dto';
import { GameService } from 'src/modules/game/game.service';
import { GameStatus, ResultReason, Winner } from 'src/shared/enum/game.enum';

@WebSocketGateway({
  cors: { origin: '*' }, // adjust for production
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
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
  async handleStartGame(
    @MessageBody() data: { userId: string; dto: StartGameDto },
    @ConnectedSocket() client: Socket,
  ) {
    const game = await this.gameService.startGame(data.userId, data.dto);
    await client.join(game._id.toString());
    this.server.to(game._id.toString()).emit('gameStarted', game);
  }

  /**
   * Handle player moves
   */
  @SubscribeMessage('makeMove')
  async handleMakeMove(
    @MessageBody() data: { userId: string; gameId: string; dto: MakeMoveDto },
    // @ConnectedSocket() client: Socket,
  ) {
    const game = await this.gameService.makeMove(data.gameId, data.userId, data.dto);

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
  async handleEndGame(@MessageBody() data: { gameId: string; reason: string; winner: string }) {
    if (!Object.values(ResultReason).includes(data.reason as ResultReason)) {
      throw new Error(`Invalid reason: ${data.reason}`);
    }

    if (!Object.values(Winner).includes(data.winner as Winner)) {
      throw new Error(`Invalid winner: ${data.winner}`);
    }

    const validatedReason = data.reason as ResultReason;
    const validatedWinner = data.winner as Winner;
    const game = await this.gameService.endGame(data.gameId, validatedReason, validatedWinner);
    this.server.to(game._id.toString()).emit('gameEnded', game);
  }
}
