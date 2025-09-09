import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Game, GameSchema } from 'src/schema/game.schema';
import { User, UserSchema } from 'src/schema/user.schema';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from 'src/logger/logger.module';
import { GameGatewayModule } from 'src/gateway/gateway.module';
import { AiListener } from './ai-listener.listener';
import { AiModule } from 'src/ai/ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Game.name, schema: GameSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    AiModule,
    forwardRef(() => GameGatewayModule),
    LoggerModule,
  ],
  controllers: [GameController],
  providers: [GameService, AiListener],
  exports: [GameService], // ✅ still export GameService
})
export class GameModule {}
