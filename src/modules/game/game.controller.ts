import { Controller, Post, Body, Param, Get, UseGuards, Req } from '@nestjs/common';
import { GameService } from './game.service';
import { StartGameDto } from './dto/start-game.dto';
import { MakeMoveDto } from './dto/make-move.dto';
import { Game } from 'src/schema/game.schema';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResultReason, Winner } from 'src/shared/enum/game.enum';

interface AuthRequest extends Request {
  user: { sub: string; email?: string };
}

@Controller('games')
@UseGuards(JwtAuthGuard) // protect routes
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // Start a new AI game
  @Post('start')
  async startGame(@Req() req: AuthRequest, @Body() dto: StartGameDto): Promise<Game> {
    const userId = req.user.sub; // assuming JWT payload has `sub`
    return this.gameService.startGame(userId, dto);
  }

  // Make a move in a game
  @Post(':gameId/move')
  async makeMove(
    @Req() req: AuthRequest,
    @Param('gameId') gameId: string,
    @Body() dto: MakeMoveDto,
  ): Promise<Game> {
    const userId = req.user['sub'];
    return await this.gameService.makeMove(gameId, userId, dto);
  }

  // Get game state
  @Get(':gameId')
  async getGame(@Param('gameId') gameId: string): Promise<Game> {
    return this.gameService.getGame(gameId);
  }

  // Optionally: end a game manually (aborted)
  @Post(':gameId/end')
  async endGame(
    @Req() req: AuthRequest,
    @Param('gameId') gameId: string,
    @Body() body: { reason: ResultReason; winner: Winner },
  ): Promise<Game> {
    return this.gameService.endGame(gameId, body.reason, body.winner);
  }
}
