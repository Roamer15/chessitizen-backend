import { forwardRef, Module } from '@nestjs/common';
import { GameGateway } from './game.gateway';
import { GameModule } from 'src/modules/game/game.module';
import { LoggerModule } from 'src/logger/logger.module';
import { AuthModule } from 'src/modules/auth/auth.module';
import { WsAuthGuard } from './guard/ws-auth.guard';
import { MatchmakingModule } from 'src/modules/matchmaking/matchmaking.module';

@Module({
  imports: [
    AuthModule,
    forwardRef(() => GameModule),
    forwardRef(() => MatchmakingModule),
    LoggerModule,
  ],
  providers: [GameGateway, WsAuthGuard],
  exports: [GameGateway],
})
export class GameGatewayModule {}
