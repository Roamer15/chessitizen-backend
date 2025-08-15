import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';
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

@Injectable()
export class AuthService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private jwtService: JwtService,
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly redis: RedisService,
    private readonly mailService: MailService,
    private readonly logger: LoggerService,
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto): Promise<void> {
    // Rate limiting
    const cached = await this.cacheManager.get<string | number>(`otp_attempts:${sendOtpDto.email}`);
    const otpAttempts = typeof cached === 'number' ? cached : Number(cached) || 0;
    await this.cacheManager.set(`otp_attempts:${sendOtpDto.email}`, otpAttempts + 1, 300); // 5 min TTL
    if (otpAttempts >= 5) throwHttpError(ErrorCode.TOO_MANY_REQUESTS);

    // Generate and store OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await this.redis.setOtp(sendOtpDto.email, otp, 300);

    // In production: Send via Twilio
    this.logger.log(`OTP for ${sendOtpDto.email}: ${otp}`);
    await this.mailService.sendOtpEmail(sendOtpDto.email, otp);
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<{ access_token: string }> {
    const email = verifyOtpDto.email;
    const storedOtp = await this.redis.getOtp(email);
    this.logger.log(`Stored OTP is: ${storedOtp}`);
    const otp = verifyOtpDto.otp;
    if (storedOtp !== otp) throwHttpError(ErrorCode.INVALID_OTP);

    await this.redis.deleteOtp(email); // clear OTP after use
    await this.redis.resetAttempts(`otp_attempts:${email}`); // clear rate limit
    const user = await this.userModel.findOneAndUpdate(
      { email },
      { verified: true },
      { new: true, upsert: true },
    );

    return {
      access_token: await this.jwtService.signAsync({ sub: user._id, email }, { expiresIn: '1h' }),
    };
  }
}
