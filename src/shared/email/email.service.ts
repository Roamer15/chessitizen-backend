import { Injectable } from '@nestjs/common';
import { Transporter, createTransport } from 'nodemailer';
import * as dotenv from 'dotenv';
import { LoggerService } from 'src/logger/logger.service';

dotenv.config();

@Injectable()
export class MailService {
  private transporter: Transporter;

  constructor(private logger: LoggerService) {
    const provider = process.env.MAIL_PROVIDER || 'smtp';

    if (provider === 'smtp') {
      this.transporter = createTransport({
        host: process.env.MAIL_HOST,
        port: parseInt(process.env.MAIL_PORT || '587', 10),
        secure: false,
        auth: {
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
        },
      });
    } else if (provider === 'sendgrid') {
      this.transporter = createTransport({
        service: 'SendGrid',
        auth: {
          user: 'apikey',
          pass: process.env.SENDGRID_API_KEY,
        },
      });
    } else {
      throw new Error(`Unknown MAIL_PROVIDER: ${provider}`);
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    const expires = process.env.OTP_EXPIRES_MINUTES || '5';
    const html = `<p>Your Chessizen login code is <strong>${otp}</strong>. It expires in ${expires} minutes.</p>`;

    this.logger.log(`Sending email`);
    await this.transporter.sendMail({
      from: `"Chessizen" <${process.env.MAIL_FROM || process.env.MAIL_USER}>`,
      to: email,
      subject: 'Your Chessizen Login Code',
      text: `Your code: ${otp} (expires in ${expires} minutes)`,
      html,
    });

    this.logger.log(`Sent OTP to ${email}`);
  }
}
