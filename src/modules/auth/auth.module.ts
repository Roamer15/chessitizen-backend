import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { RedisModule } from 'src/shared/cache/redis.module';
import { LoggerModule } from 'src/logger/logger.module';
import { JwtModule } from '@nestjs/jwt';
import { AppConfigModule } from 'src/config/config.module';
import { AppConfigService } from 'src/config/config.service';
import { MailService } from 'src/shared/email/email.service';
import { UserModule } from 'src/users/user.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UserModule,
    RedisModule,
    JwtModule.registerAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.jwtSecret,
        signOptions: {
          expiresIn: config.jwtAccessTokenExpiration,
        },
      }),
    }),
    LoggerModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, MailService, JwtAuthGuard, JwtStrategy],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
