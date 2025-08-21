import { forwardRef, Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Game, GameSchema } from 'src/schema/game.schema';
import { User, UserSchema } from 'src/schema/user.schema';
import { AuthModule } from '../auth/auth.module';
import { GameGateway } from 'src/gateway/game.gateway';
// import { AiListener } from './ai-listener.listener';
import { LoggerModule } from 'src/logger/logger.module';
import { AiModule } from 'src/ai/ai.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Game.name, schema: GameSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    forwardRef(() => AiModule),
    LoggerModule,
  ],
  controllers: [GameController],
  providers: [GameService, GameGateway],
  exports: [GameService],
})
export class GameModule {}
