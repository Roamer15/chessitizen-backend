import { forwardRef, Module } from '@nestjs/common';
import { GameModule } from '../game/game.module';
import { MatchmakingService } from './matchmaking.service';
import { RedisModule } from 'src/shared/cache/redis.module';
import { RedisProvider } from 'src/shared/cache/redis.provider';

@Module({
  imports: [forwardRef(() => GameModule), RedisModule],
  providers: [MatchmakingService, RedisProvider],
  exports: [MatchmakingService], // 👈 export if other modules need it
})
export class MatchmakingModule {}
