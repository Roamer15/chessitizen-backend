import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Send OTP to a user's email
   */
  @Post('otp/send')
  @HttpCode(HttpStatus.OK)
  async sendOtp(@Body() dto: SendOtpDto) {
    await this.authService.sendOtp(dto);
    return { message: 'OTP sent successfully' };
  }

  /**
   * Verify OTP entered by the user
   */
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const verified = await this.authService.verifyOtp(dto);

    if (verified) {
      return { message: 'OTP verified successfully' };
    } else {
      return { message: 'Invalid or expired OTP' };
    }
  }
}
