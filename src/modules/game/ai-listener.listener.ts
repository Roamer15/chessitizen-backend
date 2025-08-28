import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { GameStatus, Winner } from 'src/shared/enum/game.enum';
import { LlmChessService } from 'src/ai/llm-chess.service';
import { AiService } from 'src/ai/ai.service';
import { GameService } from './game.service';
import { LoggerService } from 'src/logger/logger.service';
import { GameGateway } from 'src/gateway/game.gateway';

@Injectable()
export class AiListener {
  eventEmitter: EventEmitter2;
  constructor(
    private readonly llm: LlmChessService,
    private readonly aiService: AiService,
    private readonly gameService: GameService,
    private readonly gameGateway: GameGateway,
    private readonly logger: LoggerService,
  ) {}

  @OnEvent('game.aiMove', { async: true })
  async handleAiMove(payload: {
    gameId: string;
    fen: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }) {
    this.logger.debug(
      `🤖 AI move requested for game ${payload.gameId} with difficulty ${payload.difficulty}`,
    );

    const { gameId, fen, difficulty } = payload;
    const game = await this.gameService.getGame(gameId);
    if (!game || game.gameStatus !== GameStatus.ONGOING) {
      this.logger.warn(`Game ${gameId} not found or not in ONGOING status`);
      return;
    }

    let move: string;
    let promotion: string | null = null;
    let explanation: string;

    try {
      this.logger.debug('🧠 Attempting LLM move generation...');
      const llmResult = await this.llm.getMoveFromFen(fen, difficulty ?? 'medium');
      move = llmResult.move;
      promotion = llmResult.promotion ?? null;
      explanation = llmResult.explanation;
      this.logger.debug(`✅ LLM generated move: ${move}`);
    } catch (llmError) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.warn(`❌ LLM failed: ${llmError.message}, falling back to Stockfish...`);

      try {
        const difficultyToSkill = { easy: 5, medium: 10, hard: 20 };
        const difficultyToDepth = { easy: 8, medium: 12, hard: 16 };

        const stockfishResult = await this.aiService.getBestMoveFromFEN(fen, {
          skillLevel: difficultyToSkill[difficulty] ?? 10,
          depth: difficultyToDepth[difficulty] ?? 12,
        });

        move = stockfishResult.from + stockfishResult.to + (stockfishResult.promotion ?? '');
        promotion = stockfishResult.promotion ?? null;
        explanation = 'Strategic engine move selected for optimal play.';
        this.logger.debug(`✅ Stockfish generated move: ${move}`);
      } catch (stockfishError) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        this.logger.error(`❌ Both LLM and Stockfish failed: ${stockfishError.message}`);
        this.logger.warn('🎲 Using random legal move as final fallback...');

        const chess = new Chess(fen);
        const legalMoves = chess.moves({ verbose: true });

        if (!legalMoves.length) {
          this.logger.error('No legal moves available - game should be over');
          return;
        }

        const randomMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
        move = randomMove.from + randomMove.to + (randomMove.promotion ?? '');
        promotion = randomMove.promotion ?? null;
        explanation = 'Random legal move selected due to AI service unavailability.';
        this.logger.debug(`✅ Random move selected: ${move}`);
      }
    }

    // Apply (server as source of truth)
    const chess = new Chess(fen);
    const res = chess.move({
      from: move.slice(0, 2),
      to: move.slice(2, 4),
      promotion: promotion ?? undefined,
    });

    if (!res) {
      this.logger.error(`❌ Invalid move generated: ${move} for FEN: ${fen}`);
      return;
    }

    this.logger.debug(`✅ Move applied successfully: ${res.san} (${move})`);

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
  }
}
