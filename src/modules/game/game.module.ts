import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { LoggerModule } from 'src/logger/logger.module';

@Module({
  imports: [GameModule, LoggerModule],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
