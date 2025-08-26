import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GameModule } from '../modules/game/game.module'; // Adjust the import path as needed
import { LoggerModule } from 'src/logger/logger.module';
import { GeminiService } from './gemini.service';
import { LlmChessService } from './llm-chess.service';
import { AuthModule } from 'src/modules/auth/auth.module';

@Module({
  imports: [forwardRef(() => GameModule), AuthModule, LoggerModule],
  providers: [AiService, GeminiService, LlmChessService],
  controllers: [AiController],
  exports: [AiService, LlmChessService],
})
export class AiModule {}
