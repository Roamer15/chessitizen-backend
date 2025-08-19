import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GameModule } from '../game/game.module';

@Module({
  imports: [
    // forwardRef to prevent circular dependency (Game <-> AI)
    forwardRef(() => GameModule),
  ],
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
