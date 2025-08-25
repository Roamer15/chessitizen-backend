// src/ai/llm-chess.service.ts
import { Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import { LoggerService } from 'src/logger/logger.service';
import { GeminiService } from './gemini.service'; // or OpenAIService if you switch

export type LlmMove = {
  move: string;
  promotion?: 'q' | 'r' | 'b' | 'n' | null;
  explanation: string;
};

@Injectable()
export class LlmChessService {
  constructor(
    private readonly logger: LoggerService,
    private readonly geminiService: GeminiService,
  ) {}

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
    const chess = new Chess(fen);
    const legal = chess.moves({ verbose: true });
    if (!legal.length) throw new Error('No legal moves');

    const legalUci = legal.map((m) => m.from + m.to + (m.promotion ?? ''));
    const sideToMove = chess.turn() === 'w' ? 'white' : 'black';

    // Difficulty knobs via temperature (or topP) — tweak in your Gemini/OpenAI wrapper
    const temperature = difficulty === 'easy' ? 0.9 : difficulty === 'hard' ? 0.2 : 0.5;

    const prompt = this.buildPrompt(fen, legalUci, sideToMove);
    // 1) First attempt
    const raw1 = await this.geminiService.generateJson(prompt, { temperature });
    let parsed: LlmMove | null = this.parseJson<LlmMove>(raw1) ?? null;

    // Validate
    const isLegal = (m?: LlmMove | null) => m?.move && legalUci.includes(m.move);
    if (isLegal(parsed))
      return {
        move: parsed!.move,
        promotion: parsed!.promotion ?? null,
        explanation: parsed!.explanation ?? '',
      };

    // 2) Repair attempt (provide the validation error explicitly)
    const repairPrompt = [
      prompt,
      '',
      'Your previous output was invalid. You must choose a move from the provided legal list and return EXACT JSON only.',
    ].join('\n');
    const raw2 = await this.geminiService.generateJson(repairPrompt, {
      temperature: Math.max(temperature - 0.2, 0.1),
    });
    parsed = this.parseJson<LlmMove>(raw2);
    if (isLegal(parsed))
      return {
        move: parsed!.move,
        promotion: parsed!.promotion ?? null,
        explanation: parsed!.explanation ?? '',
      };

    // 3) Fallback: pick the first legal move (deterministic)
    const fallback = legalUci[0];
    this.logger.warn(`LLM failed to produce legal move; falling back to ${fallback}`);
    return { move: fallback, promotion: null, explanation: 'Playing a safe legal move.' };
  }
}
