import nodemailer from 'nodemailer';
import { config } from '../config/environment';
import { logger } from '../utils/logger';

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  initialize(): void {
    if (!config.email.user || !config.email.pass) {
      logger.warn('[Email] SMTP credentials not set — forgot-password emails will be logged only');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
    logger.info('[Email] SMTP transporter initialized');
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;
                  background:#0f172a;border-radius:12px;color:#fff">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-block;background:#3b82f6;border-radius:12px;
                      padding:12px 20px;font-size:22px;font-weight:bold">
            ⚡ BlueWatt
          </div>
        </div>
        <h2 style="margin:0 0 8px;font-size:20px">Password Reset Code</h2>
        <p style="color:#94a3b8;margin:0 0 24px;font-size:14px">
          Use the code below to reset your BlueWatt password.
          This code expires in <strong style="color:#fff">15 minutes</strong>.
        </p>
        <div style="background:#1e293b;border-radius:8px;padding:20px;
                    text-align:center;letter-spacing:12px;font-size:32px;
                    font-weight:bold;color:#3b82f6;margin-bottom:24px">
          ${otp}
        </div>
        <p style="color:#64748b;font-size:12px;margin:0">
          If you did not request a password reset, ignore this email.
          Your password will not be changed.
        </p>
      </div>
    `;

    if (!this.transporter) {
      // No SMTP configured — log the OTP so admin can share it manually
      logger.info(`[Email] Password reset OTP for ${to}: ${otp}  (SMTP not configured)`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: config.email.from,
        to,
        subject: 'BlueWatt — Password Reset Code',
        html,
      });
      logger.info(`[Email] Password reset OTP sent to ${to}`);
    } catch (err) {
      logger.error('[Email] Failed to send OTP email:', err);
      throw new Error('Failed to send reset email. Please try again.');
    }
  }
}

export const emailService = new EmailService();
