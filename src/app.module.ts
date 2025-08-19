import { Module } from '@nestjs/common';
import databaseConfig from './config/configuration';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { LoggerModule } from './logger/logger.module';
import { UserModule } from './users/user.module';
import { RedisModule } from './shared/cache/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { GameModule } from './modules/game/game.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [databaseConfig],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI_TEST'),
        retryAttempts: 5,
        retryDelay: 1000,
      }),
      inject: [ConfigService],
    }),
    GameModule,
    AuthModule,
    RedisModule,
    LoggerModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
