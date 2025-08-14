import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: NestConfigService) {}

  get dbHost(): string | undefined {
    return this.config.get<string>('DB_HOST');
  }

  get dbPort(): number | undefined {
    return this.config.get<number>('DB_PORT');
  }

  get dbUsername(): string | undefined {
    return this.config.get<string>('DB_USERNAME');
  }

  get dbPassword(): string | undefined {
    return this.config.get<string>('DB_PASSWORD');
  }

  get dbName(): string | undefined {
    return this.config.get<string>('DB_NAME');
  }

  get typeormLogging(): boolean | undefined {
    return this.config.get<boolean>('TYPEORM_LOGGING');
  }

  // 🔐 Auth
  get jwtSecret(): string | undefined {
    return this.config.get<string>('JWT_SECRET');
  }

  get jwtExpiresIn(): string | undefined {
    return this.config.get<string>('JWT_ACCESS_TOKEN_EXPIRATION');
  }

  get jwtAccessTokenExpiration(): string | undefined {
    return this.config.get<string>('JWT_ACCESS_TOKEN_EXPIRATION');
  }

  get jwtRefrehTokenExpiration(): string | undefined {
    return this.config.get<string>('JWT_REFRESH_TOKEN_EXPIRATION');
  }

  get jwtAccesTokenExpirationMs(): string | undefined {
    return this.config.get<string>('JWT_ACCESS_TOKEN_EXPIRATION_MS');
  }

  get jwtRefrehTokenExpirationMs(): string | undefined {
    return this.config.get<string>('JWT_REFRESH_TOKEN_EXPIRATION_MS');
  }

  get frontendUrl(): string | undefined {
    return this.config.get<string>('FRONTEND_URL');
  }

  // GOOGLE AUTHENTIFICATION

  get googleClientID(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_ID');
  }

  get googleSecretID(): string | undefined {
    return this.config.get<string>('GOOGLE_CLIENT_SECRET');
  }

  get callBackUrl(): string | undefined {
    return this.config.get<string>('GOOGLE_CALLBACK_URL');
  }

  get resendApiKey(): string | undefined {
    return this.config.get<string>('RESEND_API_KEY');
  }

  get resendSenderEmail(): string | undefined {
    return this.config.get<string>('RESEND_SENDER_EMAIL');
  }

  // 📧 Mailing
  get mailHost(): string | undefined {
    return this.config.get<string>('MAIL_HOST');
  }

  get mailPort(): number | undefined {
    return this.config.get<number>('MAIL_PORT');
  }

  get mailUser(): string | undefined {
    return this.config.get<string>('MAIL_USER');
  }

  get mailPassword(): string | undefined {
    return this.config.get<string>('MAIL_PASSWORD');
  }
}
