import { Injectable, BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

/** Tiempo de vida del código MFA enviado al `email` del usuario. */
const MFA_OTP_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class MfaService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
  ) {}

  generateSixDigitCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /**
   * Genera OTP de login, lo guarda en `mfaSecret` y lo envía solo al `email`.
   */
  async issueEmailOtpAndSend(user: User): Promise<void> {
    const destino = user.email?.trim() || null;
    if (!destino) {
      throw new BadRequestException(
        'El usuario debe tener `email` configurado para recibir códigos MFA.',
      );
    }
    const code = this.generateSixDigitCode();
    const hash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + MFA_OTP_TTL_MS);
    const payload = `${expiresAt.getTime()}|${hash}`;
    await this.usersService.setMfaSecretChallenge(user.id, payload);
    await this.mailService.sendMfaLoginCode(destino, code);
  }

  /**
   * Tras activar MFA: correo opcional de confirmación al `email` si SMTP está configurado.
   */
  async prepareMfaActivationResponse(
    user: User,
  ): Promise<{ message: string; emailSent: boolean; qrCodeUrl: null }> {
    const destino = user.email?.trim() || null;
    const emailSent = destino
      ? await this.mailService.sendMfaActivatedOptional(destino)
      : false;
    return {
      message:
        'MFA por correo activado. En cada inicio de sesión recibirás un código de 6 dígitos en tu correo.',
      emailSent,
      qrCodeUrl: null,
    };
  }
}
