import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    const from = this.config.get<string>('EMAIL_FROM')?.trim() ?? 'Community Manager <onboarding@resend.dev>';
    const subject = 'Restablecer contraseña — Community Manager';
    const html = `
      <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta.</p>
      <p><a href="${resetUrl}">Haz clic aquí para elegir una nueva contraseña</a></p>
      <p>El enlace caduca en 1 hora. Si no solicitaste esto, ignora este correo.</p>
    `.trim();

    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY no configurada — enlace de reset para ${to}: ${resetUrl}`,
      );
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!response.ok) {
      const detail = await response.text();
      this.logger.error(`Resend falló (${response.status}): ${detail}`);
      throw new Error('No se pudo enviar el correo de recuperación');
    }
  }
}
