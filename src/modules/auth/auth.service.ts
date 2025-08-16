import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { throwHttpError } from 'src/common/errors/http-exception.helper';
import { User } from 'src/schema/user.schema';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ErrorCode } from 'src/common/errors/error-codes.enum';
import { SendOtpDto } from './dto/send-otp.dto';
import { LoggerService } from 'src/logger/logger.service';
import { RedisService } from 'src/shared/cache/redis.service';
import { MailService } from 'src/shared/email/email.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';

type JwtPayload = { sub: string; email: string; jti?: string };

const ACCESS_TTL = parseInt(process.env.ACCESS_TOKEN_TTL || '1800', 10); // seconds
const REFRESH_TTL = parseInt(process.env.REFRESH_TOKEN_TTL || '1209600', 10); // seconds

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly redis: RedisService,
    private readonly mailService: MailService,
    private readonly logger: LoggerService,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto): Promise<void> {
    // Rate limiting
    const otpAttempts = await this.redis.getAttempts(`otp_attempts:${sendOtpDto.email}`);
    await this.redis.set(`otp_attempts:${sendOtpDto.email}`, otpAttempts + 1, 300); // 5 min TTL
    if (otpAttempts >= 5) throwHttpError(ErrorCode.TOO_MANY_REQUESTS);

    // Generate and store OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.setOtp(sendOtpDto.email, otp, 300);

    // Send via email
    this.logger.log(`OTP for ${sendOtpDto.email}: ${otp}`);
    await this.mailService.sendOtpEmail(sendOtpDto.email, otp);
    this.logger.log(`OTP sent`);
  }

  async verifyOtp({ email, otp }: VerifyOtpDto): Promise<{
    access_token: string;
    refresh_token: string;
    user: { id: string; email: string };
  }> {
    const stored = await this.redis.getOtp(email);
    if (stored !== otp) {
      throwHttpError(ErrorCode.INVALID_OTP);
    }

    await this.redis.deleteOtp(email);
    await this.redis.resetAttempts(`otp_attempts:${email}`);

    const user = await this.userModel.findOneAndUpdate(
      { email },
      { verified: true },
      { new: true, upsert: true },
    );

    const userId = user._id as string; // Force TypeScript to treat _id as string

    const { access_token, refresh_token } = await this.issueTokens(userId, user.email);

    return {
      access_token,
      refresh_token,
      user: { id: userId, email: user.email },
    };
  }
  // -------------------------
  // Tokens
  // -------------------------
  private async signAccessToken(userId: string, email: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email };
    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_ACCESS_SECRET,
      expiresIn: `${ACCESS_TTL}s`,
    });
  }

  private async signRefreshToken(userId: string, email: string, jti: string): Promise<string> {
    const payload: JwtPayload = { sub: userId, email, jti };
    return this.jwtService.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: `${REFRESH_TTL}s`,
    });
  }

  private async allowlistRefresh(userId: string, jti: string): Promise<void> {
    // store "1" with TTL; key format lets you revoke per-session
    await this.redis.set(`rt:${userId}:${jti}`, '1', REFRESH_TTL);
  }

  private async isRefreshAllowed(userId: string, jti: string): Promise<boolean> {
    const v = await this.redis.get<string>(`rt:${userId}:${jti}`);
    return v === '1';
  }

  private async revokeRefresh(userId: string, jti: string): Promise<void> {
    await this.redis.del(`rt:${userId}:${jti}`);
  }

  private async issueTokens(
    userId: string,
    email: string,
  ): Promise<{ access_token: string; refresh_token: string }> {
    const jti = randomUUID();
    const [access_token, refresh_token] = await Promise.all([
      this.signAccessToken(userId, email),
      this.signRefreshToken(userId, email, jti),
    ]);
    await this.allowlistRefresh(userId, jti);
    return { access_token, refresh_token };
  }

  // -------------------------
  // Refresh & Logout
  // -------------------------
  async refresh(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
    } catch {
      throwHttpError(ErrorCode.UNAUTHORIZED);
      // TS narrow
    }

    const userId = payload.sub;
    const email = payload.email;
    const jti = payload.jti;
    if (!userId || !jti) {
      throwHttpError(ErrorCode.UNAUTHORIZED);
    }

    const allowed = await this.isRefreshAllowed(userId, jti);
    if (!allowed) {
      // token revoked or rotated – force re-login
      throwHttpError(ErrorCode.UNAUTHORIZED);
    }

    // rotate refresh: revoke old jti, issue new jti
    await this.revokeRefresh(userId, jti);
    return this.issueTokens(userId, email);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });
      if (payload.sub && payload.jti) {
        await this.revokeRefresh(payload.sub, payload.jti);
      }
    } catch {
      // if invalid/expired, nothing to revoke; just return
    }
  }
}
