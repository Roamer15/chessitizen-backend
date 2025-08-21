import { Body, Controller, Param, Post } from '@nestjs/common';
import { AiService } from './ai.service';
import { GameService } from '../modules/game/game.service';

class SuggestBodyDto {
  fen?: string; // optional: override server FEN (analysis mode); otherwise read from game
  pgn?: string; // optional context
  depth?: number; // 6–18 typical
  skillLevel?: number; // 0–20
  movetimeMs?: number; // alternative to depth
}

// class AiMoveBodyDto {
//   depth?: number;
//   skillLevel?: number;
//   movetimeMs?: number;
// }

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly gameService: GameService,
  ) {}

  /**
   * Coach suggestion: does NOT modify game state.
   * If fen not provided, loads the game and uses its current FEN.
   */
  @Post(':id/suggest')
  async suggest(@Param('id') gameId: string, @Body() body: SuggestBodyDto) {
    const { fen: fenOverride, pgn, depth, skillLevel, movetimeMs } = body;

    let fen = fenOverride;
    if (!fen) {
      const game = await this.gameService.getGame(gameId);
      if (!game) throw new Error('Game not found');
      fen = game.currentFen;
    }

    const suggestion = await this.aiService.suggestMove(fen, pgn, {
      depth,
      skillLevel,
      movetimeMs,
    });

    return {
      gameId,
      suggestion,
    };
  }

  /**
   * Make the AI play a move for this game and persist it.
   * Returns the updated game state.
   */
  // @Post(':id/ai-move')
  // async aiMove(@Param('id') gameId: string, @Body() body: AiMoveBodyDto) {
  //   const { depth, skillLevel, movetimeMs } = body;
  //   // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  //   const updated = await this.aiService.applyAiMoveToGame(gameId, {
  //     depth: depth,
  //     skillLevel: skillLevel,
  //     movetimeMs: movetimeMs,
  //   });
  //   return {
  //     gameId,
  //     // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  //     fen: updated.fen,
  //     pgn: updated.pgn,
  //     status: updated.status,
  //     moveHistory: updated.moveHistory,
  //     winner: (updated as any).winner ?? null,
  //   };
  // }
}
