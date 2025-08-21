import { OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { AiService } from 'src/ai/ai.service';
import { GameService } from './game.service';
import { GameStatus, Winner } from 'src/shared/enum/game.enum';

@Injectable()
export class AiListener {
  constructor(
    private readonly aiService: AiService,
    private readonly gameService: GameService,
  ) {}

  @OnEvent('game.aiMove')
  async handleAiMove(payload: { gameId: string; fen: string; difficulty: string }) {
    const { gameId, fen, difficulty } = payload;

    const game = await this.gameService.getGame(gameId);
    if (!game || game.gameStatus !== GameStatus.ONGOING) return;

    const chess = new Chess(fen);
    const aiSkill = this.gameService.getAiSkillLevel(difficulty);

    const aiMove = await this.aiService.getBestMoveFromFEN(fen, {
      skillLevel: aiSkill.skillLevel,
      depth: aiSkill.depth,
    });

    if (aiMove) {
      chess.move(aiMove);

      game.currentFen = chess.fen();
      game.moves.push({
        from: aiMove.from,
        to: aiMove.to,
        fen: chess.fen(),
        san: aiMove.san,
      });

      if (chess.isGameOver()) {
        await this.gameService.handleGameOver(game, chess, Winner.AI);
        return;
      }

      await game.save();

      // ✅ Optional: emit socket update to clients
      this.gameService.broadcastGameUpdate(game);
    }
  }
}
