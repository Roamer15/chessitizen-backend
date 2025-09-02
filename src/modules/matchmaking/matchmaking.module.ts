import { Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { MatchmakingService } from './matchmaking.service';
import { RedisModule } from 'src/shared/cache/redis.module';

@Module({
  imports: [GameModule, RedisModule],
  providers: [MatchmakingService],
  exports: [MatchmakingService], // 👈 export if other modules need it
})
export class MatchmakingModule {}
