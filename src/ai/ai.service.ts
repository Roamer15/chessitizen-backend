import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { Inject, forwardRef } from '@nestjs/common';
import { GameService } from '../modules/game/game.service';
import { GameStatus } from 'src/shared/enum/game.enum';
import { GeminiService } from '../ai/gemini.service';
import { LoggerService } from 'src/logger/logger.service';

type BestMove = { from: string; to: string; promotion?: string; san: string };
type EngineOptions = { depth?: number; skillLevel?: number; movetimeMs?: number };

@Injectable()
export class AiService {
  constructor(
    @Inject(forwardRef(() => GameService))
    private readonly gameService: GameService,
    private readonly geminiService: GeminiService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Creates a Stockfish engine instance (WASM via `stockfish` package).
   * Each request uses a short-lived engine for simplicity & isolation.
   */
  private createEngine(): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-require-imports
    const Stockfish = require('stockfish');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    return Stockfish();
  }

  /**
   * Ask Stockfish for the best move from a given FEN.
   * You can control strength via depth/skillLevel/movetimeMs.
   */
  async getBestMoveFromFEN(fen: string, opts: EngineOptions = {}): Promise<BestMove> {
    const { depth = 13, skillLevel = 14, movetimeMs } = opts;

    return new Promise<BestMove>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const engine = this.createEngine();
      let resolved = false;

      const cleanUp = () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
          if (engine?.terminate) engine.terminate();
        } catch {
          /* noop */
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const send = (cmd: string) => engine.postMessage(cmd);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      engine.onmessage = (raw: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const msg: string = typeof raw === 'string' ? raw : raw?.data;
        if (!msg) return;

        // Example: "bestmove e2e4" or "bestmove e7e8q" (with promotion)
        if (msg.startsWith('bestmove')) {
          const parts = msg.split(/\s+/);
          const uci = parts[1]; // e.g. e2e4 or e7e8q
          const from = uci.slice(0, 2);
          const to = uci.slice(2, 4);
          const promotion = uci.length > 4 ? uci.slice(4) : undefined;
          const san = uci;

          resolved = true;
          cleanUp();
          resolve({ from, to, promotion, san });
        }
      };

      // Basic UCI init
      send('uci');
      // Optional skill level (0–20); lower = weaker/more human-like
      send(`setoption name Skill Level value ${Math.min(Math.max(skillLevel, 0), 20)}`);
      // (Optional) Contempt, Threads, Hash, etc. can be tuned here

      send('isready');
      send(`position fen ${fen}`);

      if (movetimeMs && movetimeMs > 0) {
        send(`go movetime ${movetimeMs}`);
      } else {
        send(`go depth ${depth}`);
      }

      // safety timeout (fallback)
      const watchdog = setTimeout(
        () => {
          if (!resolved) {
            cleanUp();
            reject(new Error('Stockfish timeout'));
          }
        },
        Math.max(movetimeMs ?? 0, 10000),
      ); // at least 10s
      // clear when resolved
      const stopWatchdog = () => {
        if (watchdog) clearTimeout(watchdog);
      };
      // patch resolve/reject to stop watchdog
      const _resolve = resolve;
      resolve = (v: BestMove) => {
        stopWatchdog();
        _resolve(v);
      };
      const _reject = reject;
      reject = (e: any) => {
        stopWatchdog();
        _reject(e);
      };
    });
  }

  /**
   * Suggest a move (coach mode). Does not change game state.
   * Optionally returns a short explanation (LLM could be integrated later).
   */
  async suggestMove(
    fen: string,
    pgn?: string,
    opts: EngineOptions = {},
  ): Promise<{ move: string; from: string; to: string; promotion?: string; explanation: string }> {
    const best = await this.getBestMoveFromFEN(fen, opts);
    const san = this.toSAN(fen, best);
    // Placeholder explanation. Replace with LLM call if desired.
    const prompt = `Engine suggests ${san} to improve position from ${best.from}-${best.to}. take into cosideration the current board state ${fen} and the stockfish options level provided ${JSON.stringify(opts)}`;
    const explanation = String(await this.geminiService.generateExplanation(prompt));
    return { move: `${best.from}${best.to}${best.promotion ?? ''}`, ...best, explanation };
  }

  /**
   * Apply AI move to a game: fetch game, let engine pick move, validate with chess.js,
   * persist via GameService, and return updated game.
   */
  async applyAiMoveToGame(gameId: string, opts: EngineOptions = {}) {
    const game = await this.gameService.getGame(gameId);
    if (!game) throw new Error('Game not found');
    if (
      game.gameStatus !== GameStatus.PENDING &&
      game.gameStatus !== GameStatus.ONGOING &&
      game.gameStatus !== GameStatus.WAITING
    ) {
      throw new Error(`Game status is ${game.gameStatus}, cannot move`);
    }

    const best = await this.getBestMoveFromFEN(game.currentFen, opts);

    const chess = new Chess(game.currentFen);
    const moveRes = chess.move({
      from: best.from,
      to: best.to,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      promotion: best.promotion as any, // e.g. 'q'
    });

    if (!moveRes) {
      this.logger.warn(
        `Engine proposed illegal move ${best.from}-${best.to} on FEN: ${game.currentFen}`,
      );
      throw new Error('AI proposed an illegal move');
    }

    // Persist via GameService (centralized updates)
    return this.gameService.broadcastGameUpdate(game);
  }

  /**
   * Convert a UCI-like move to SAN using chess.js for nicer display.
   */
  private toSAN(fen: string, move: BestMove): string {
    const chess = new Chess(fen);
    const res = chess.move({
      from: move.from,
      to: move.to,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      promotion: move.promotion as any,
    });
    return res?.san ?? `${move.from}-${move.to}`;
  }
}
