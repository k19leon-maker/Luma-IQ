import nodemailer from 'nodemailer';
import { env } from '../config/env';

function createTransport() {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
}

export const emailService = {
  isConfigured(): boolean {
    return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
  },

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${env.FRONTEND_URL}/auth/verify-email?token=${token}`;
    const transport = createTransport();

    if (!transport) {
      // No SMTP configured — log link for dev
      console.info(`[Email] Verification link for ${to}: ${link}`);
      return;
    }

    await transport.sendMail({
      from: `"LumaIQ" <${env.SMTP_FROM}>`,
      to,
      subject: 'Подтвердите ваш email — LumaIQ',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1a1a1a;margin-bottom:8px">Подтвердите email</h2>
          <p style="color:#555;margin-bottom:24px">
            Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты и получить доступ ко всем функциям LumaIQ.
          </p>
          <a href="${link}"
             style="display:inline-block;background:#D4A847;color:#fff;text-decoration:none;
                    padding:12px 28px;border-radius:8px;font-weight:500;font-size:15px">
            Подтвердить email
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px">
            Ссылка действительна 24 часа. Если вы не регистрировались — просто проигнорируйте это письмо.
          </p>
        </div>
      `,
    });
  },
};
