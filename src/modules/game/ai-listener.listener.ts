// import { OnEvent } from '@nestjs/event-emitter';
// import { Injectable } from '@nestjs/common';
// import { Chess } from 'chess.js';
// import { AiService } from 'src/ai/ai.service';
// import { GameService } from './game.service';
// import { GameGateway } from 'src/gateway/game.gateway';
// import { GameStatus, Winner } from 'src/shared/enum/game.enum';

// @Injectable()
// export class AiListener {
//   constructor(
//     private readonly aiService: AiService,
//     private readonly gameService: GameService,
//     private readonly gameGateway: GameGateway,
//   ) {}

//   @OnEvent('game.aiMove')
//   async handleAiMove(payload: { gameId: string; fen: string; difficulty: string }) {
//     const { gameId, fen, difficulty } = payload;
//     console.log('aiMove');

//     const game = await this.gameService.getGame(gameId);
//     if (!game || game.gameStatus !== GameStatus.ONGOING) return;

//     const chess = new Chess(fen);
//     const aiSkill = this.gameService.getAiSkillLevel(difficulty);

//     const aiMove = await this.aiService.getBestMoveFromFEN(fen, {
//       skillLevel: aiSkill.skillLevel,
//       depth: aiSkill.depth,
//     });

//     console.log(`AI move`, aiMove);

//     if (aiMove) {
//       chess.move(aiMove);

//       game.currentFen = chess.fen();
//       game.moves.push({
//         from: aiMove.from,
//         to: aiMove.to,
//         fen: chess.fen(),
//         san: aiMove.san,
//       });

//       if (chess.isGameOver()) {
//         await this.gameService.handleGameOver(game, chess, Winner.AI);
//         return;
//       }

//       await game.save();

//       // ✅ Optional: emit socket update to clients
//       // this.gameService.broadcastGameUpdate(game);
//       this.gameGateway.server.to(game._id.toString()).emit('aiMoveMade', {
//         gameId: game._id,
//         move: aiMove, // { from, to, promotion, san }
//         currentFen: game.currentFen,
//       });
//     }
//   }
// }

// src/modules/game/ai-listener.listener.ts
import { OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { GameService } from './game.service';
import { GameGateway } from 'src/gateway/game.gateway';
import { GameStatus, Winner } from 'src/shared/enum/game.enum';
import { LlmChessService } from 'src/ai/llm-chess.service';

@Injectable()
export class AiListener {
  constructor(
    private readonly llm: LlmChessService,
    private readonly gameService: GameService,
    private readonly gameGateway: GameGateway,
  ) {}

  @OnEvent('game.aiMove', { async: true })
  async handleAiMove(payload: {
    gameId: string;
    fen: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }) {
    const { gameId, fen, difficulty } = payload;
    const game = await this.gameService.getGame(gameId);
    if (!game || game.gameStatus !== GameStatus.ONGOING) return;

    // Ask LLM
    const { move, promotion, explanation } = await this.llm.getMoveFromFen(
      fen,
      difficulty ?? 'medium',
    );

    // Apply (server as source of truth)
    const chess = new Chess(fen);
    const res = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: promotion ?? undefined,
    });
    if (!res) return; // very unlikely due to validation; safety guard

    game.currentFen = chess.fen();
    game.moves.push({ from: res.from, to: res.to, fen: game.currentFen, san: res.san });

    if (chess.isGameOver()) {
      await this.gameService.handleGameOver(game, chess, Winner.AI);
      // also include explanation if you want
      this.gameGateway.server.to(game._id.toString()).emit('aiMoveMade', {
        gameId: game._id,
        move: { from: res.from, to: res.to, san: res.san, promotion: promotion ?? null },
        currentFen: game.currentFen,
        explanation,
      });
      return;
    }

    await game.save();
    // Broadcast
    this.gameService.broadcastGameUpdate(game);
    this.gameGateway.server.to(game._id.toString()).emit('aiMoveMade', {
      gameId: game._id,
      move: { from: res.from, to: res.to, san: res.san, promotion: promotion ?? null },
      currentFen: game.currentFen,
      explanation,
    });
  }
}
