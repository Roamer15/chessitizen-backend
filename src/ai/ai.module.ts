import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GameModule } from '../modules/game/game.module'; // Adjust the import path as needed
import { LoggerModule } from 'src/logger/logger.module';

@Module({
  imports: [forwardRef(() => GameModule), LoggerModule],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
