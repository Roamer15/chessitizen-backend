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

  async generateExplanation(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  }
}
