import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class GeminiService {
  private readonly genAI: GoogleGenerativeAI;
  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not defined');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
  }

  private readonly maxTries = 3;
  private readonly fallbackResponse = 'The AI is currently unavailable.';

  async generateExplanation(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }

  async generateChessMove(fen: string, skillLevel: number, depth: number) {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt =
      `You are a chess assistant(act closely to a chess engine). Return ONLY strict JSON.\n\n` +
      `TASK: Choose ONE move for the side to move in the given FEN.\n` +
      `CONSTRAINTS: The move MUST be one of legal with respect to the FEN. Do not formulate your own FEN. Use the SkillLevel and Depth to know what magnitude your move should carry\n` +
      `FORMAT: {"from":"<first two characters of uci or san>","to":"<last two characters of uci or san>","promotion":"<if any>","san:<uci or san>"}\n\n` +
      `FEN: ${fen}\n` +
      `SkillLevel: ${JSON.stringify(skillLevel)}\n` +
      `Depth: ${JSON.stringify(depth)}\n`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response;
  }

  async generateJson(
    prompt: string,
    opts?: { temperature?: number; topP?: number; maxOutputTokens?: number },
  ): Promise<string> {
    // call your LLM here; return content as string
    // e.g., Google, OpenAI, etc. Keep temperature/topP mapped from opts.
    const model = this.genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: opts?.temperature ?? 0.7, // default fallback
        topP: opts?.topP ?? 0.9,
        maxOutputTokens: opts?.maxOutputTokens ?? 256,
      },
    });
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
    // return '{"move":"e7e5","promotion":null,"explanation":"Fights for the center."}';
  }
}
