import { Module, forwardRef } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { GameModule } from '../modules/game/game.module'; // Adjust the import path as needed

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
