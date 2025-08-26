import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { GeminiService } from './gemini.service';
import { LoggerService } from 'src/logger/logger.service';

export type LlmMove = {
  move: string;
  promotion?: 'q' | 'r' | 'b' | 'n' | null;
  explanation: string;
};

@Injectable()
export class LlmChessService {
  private readonly maxRetries = 3;
  private readonly retryDelayMs = 1000;
  private circuitBreakerFailures = 0;
  private readonly circuitBreakerThreshold = 5;
  private circuitBreakerResetTime = Date.now();
  private readonly circuitBreakerTimeoutMs = 60000; // 1 minute

  constructor(
    private readonly logger: LoggerService,
    private readonly geminiService: GeminiService,
  ) {}

  private isCircuitBreakerOpen(): boolean {
    if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
      if (Date.now() - this.circuitBreakerResetTime > this.circuitBreakerTimeoutMs) {
        // Reset circuit breaker after timeout
        this.circuitBreakerFailures = 0;
        this.circuitBreakerResetTime = Date.now();
        return false;
      }
      return true;
    }
    return false;
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= this.maxRetries) {
        throw error;
      }

      const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.warn(`LLM attempt ${attempt} failed, retrying in ${delay}ms: ${error.message}`);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryWithBackoff(operation, attempt + 1);
    }
  }

  private parseJson<T>(raw: string): T | null {
    try {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start === -1 || end === -1 || end < start) return null;
      return JSON.parse(raw.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }

  private buildPrompt(fen: string, legalMoves: string[], sideToMove: 'white' | 'black'): string {
    return [
      `Position FEN: ${fen}`,
      `It is ${sideToMove} to move.`,
      `Legal moves (UCI): ${legalMoves.join(', ')}`,
      '',
      'Task:',
      '1) Choose ONE legal move (UCI).',
      '2) If promoting, include promotion piece letter (q,r,b,n).',
      '3) Provide a one-sentence explanation aimed at an intermediate player.',
      '',
      'Respond in EXACT JSON:',
      '{"move":"e2e4","promotion":null,"explanation":"..."}',
      '',
      'Rules:',
      '- The "move" MUST be one of the legal moves listed.',
      '- Do not include any text outside the JSON.',
    ].join('\n');
  }

  /**
   * Main entry: ask LLM for a move. With validation, repair, fallback.
   */
  async getMoveFromFen(
    fen: string,
    difficulty: 'easy' | 'medium' | 'hard' = 'medium',
  ): Promise<LlmMove> {
    if (this.isCircuitBreakerOpen()) {
      this.logger.warn('LLM circuit breaker is open, falling back to deterministic move');
      return this.getDeterministicFallbackMove(fen);
    }

    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    if (!legal.length) throw new Error('No legal moves');

    const legalUci = legal.map((m) => m.from + m.to + (m.promotion ?? ''));
    const sideToMove = chess.turn() === 'w' ? 'white' : 'black';

    const temperature = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 0.2 : 0.5;

    const prompt = this.buildPrompt(fen, legalUci, sideToMove);

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('LLM request timeout')), 30000);
      });

      const raw1 = await Promise.race([
        this.retryWithBackoff(() => this.geminiService.generateJson(prompt, { temperature })),
        timeoutPromise,
      ]);

      let parsed: LlmMove | null = this.parseJson<LlmMove>(raw1) ?? null;

      const isLegal = (m?: LlmMove | null) => m?.move && legalUci.includes(m.move);
      if (isLegal(parsed)) {
        this.circuitBreakerFailures = 0;
        return {
          move: parsed!.move,
          promotion: parsed!.promotion ?? null,
          explanation: parsed!.explanation ?? '',
        };
      }

      const repairPrompt = [
        prompt,
        '',
        'Your previous output was invalid. You must choose a move from the provided legal list and return EXACT JSON only.',
      ].join('\n');

      const raw2 = await Promise.race([
        this.retryWithBackoff(() =>
          this.geminiService.generateJson(repairPrompt, {
            temperature: Math.max(temperature - 0.2, 0.1),
          }),
        ),
        timeoutPromise,
      ]);

      parsed = this.parseJson<LlmMove>(raw2);
      if (isLegal(parsed)) {
        this.circuitBreakerFailures = 0;
        return {
          move: parsed!.move,
          promotion: parsed!.promotion ?? null,
          explanation: parsed!.explanation ?? '',
        };
      }

      throw new Error('LLM failed to provide valid moves after repair attempt');
    } catch (error) {
      this.circuitBreakerFailures++;
      this.circuitBreakerResetTime = Date.now();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`LLM service failed: ${error.message}`);

      return this.getDeterministicFallbackMove(fen);
    }
  }

  private getDeterministicFallbackMove(fen: string): LlmMove {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });

    if (!legalMoves.length) {
      throw new Error('No legal moves available');
    }

    let selectedMove = legalMoves[0];

    const captures = legalMoves.filter((m) => m.captured);
    if (captures.length > 0) {
      selectedMove = captures[0];
    } else {
      const checks = legalMoves.filter((m) => {
        const testChess = new Chess(fen);
        testChess.move(m);
        return testChess.inCheck();
      });

      if (checks.length > 0) {
        selectedMove = checks[0];
      } else {
        const centerMoves = legalMoves.filter((m) => ['e4', 'e5', 'd4', 'd5'].includes(m.to));
        if (centerMoves.length > 0) {
          selectedMove = centerMoves[0];
        }
      }
    }

    const validPromotion =
      selectedMove.promotion && ['q', 'r', 'b', 'n'].includes(selectedMove.promotion)
        ? (selectedMove.promotion as 'q' | 'r' | 'b' | 'n')
        : null;

    const uci = selectedMove.from + selectedMove.to + (selectedMove.promotion ?? '');
    return {
      move: uci,
      promotion: validPromotion,
      explanation: 'Playing a strategic fallback move due to AI service unavailability.',
    };
  }
}
