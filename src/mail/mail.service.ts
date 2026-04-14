import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getOrCreateTransporter(): Transporter | null {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    if (!host || !user || !pass) {
      return null;
    }
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }
    return this.transporter;
  }

  private mailFrom(): string {
    const explicit = this.configService.get<string>('MAIL_FROM');
    if (explicit) return explicit;
    const user = this.configService.get<string>('SMTP_USER');
    return user ?? 'no-reply@localhost';
  }

  /**
   * Envío obligatorio (p. ej. código MFA en login). Falla si SMTP no está configurado o el envío falla.
   */
  async sendMfaLoginCode(to: string, code: string): Promise<void> {
    const transport = this.getOrCreateTransporter();
    if (!transport) {
      throw new ServiceUnavailableException(
        'El servidor de correo (SMTP) no está configurado. Defina SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.',
      );
    }
    const text = [
      'Tu código de verificación en dos pasos es:',
      '',
      code,
      '',
      'El código caduca en unos minutos. Si no solicitaste este acceso, ignora este mensaje.',
    ].join('\n');

    try {
      await transport.sendMail({
        from: this.mailFrom(),
        to,
        subject: 'Código de verificación MFA',
        text,
      });
    } catch (err) {
      this.logger.error('Error al enviar correo MFA de login', err);
      throw new ServiceUnavailableException('No se pudo enviar el correo con el código MFA.');
    }
  }

  /**
   * Aviso opcional al activar MFA. No lanza si SMTP falta o falla el envío.
   */
  async sendMfaActivatedOptional(to: string): Promise<boolean> {
    const transport = this.getOrCreateTransporter();
    if (!transport) {
      return false;
    }
    const text =
      'Se ha activado la verificación en dos pasos (MFA) por correo electrónico en tu cuenta. ' +
      'En los próximos inicios de sesión recibirás un código de 6 dígitos en este correo.';
    try {
      await transport.sendMail({
        from: this.mailFrom(),
        to,
        subject: 'MFA activado',
        text,
      });
      return true;
    } catch (err) {
      this.logger.warn('No se pudo enviar el correo de confirmación MFA activado', err);
      return false;
    }
  }
}
