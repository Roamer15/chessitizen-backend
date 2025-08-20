import { Module } from '@nestjs/common';
import { GameService } from './game.service';
import { GameController } from './game.controller';
import { LoggerModule } from 'src/logger/logger.module';
import { MongooseModule } from '@nestjs/mongoose';
import { Game, GameSchema } from 'src/schema/game.schema';
import { User, UserSchema } from 'src/schema/user.schema';
import { AuthModule } from '../auth/auth.module';
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Game.name, schema: GameSchema },
      { name: User.name, schema: UserSchema },
    ]),
    AuthModule,
    LoggerModule,
  ],
  controllers: [GameController],
  providers: [GameService],
})
export class GameModule {}
