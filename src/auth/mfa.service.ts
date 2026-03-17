import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { User } from '../users/entities/user.entity';

@Injectable()
export class MfaService {
  constructor(private readonly configService: ConfigService) {}

  /**
   * Genera un nuevo secreto MFA y su correspondiente código QR.
   * El QR usa el estándar TOTP (RFC 6238), compatible con Microsoft Authenticator,
   * Google Authenticator y cualquier app que soporte TOTP.
   */
  public async generateMfaSecret(user: User) {
    const secret = generateSecret();

    // El nombre de la app (se puede leer de una variable de entorno)
    const appName = this.configService.get<string>('APP_NAME', 'DB Billing API');

    // Genera la URI estándar otpauth:// para Microsoft Authenticator y apps TOTP
    const otpauthUrl = generateURI({
      issuer: appName,
      label: user.username,
      secret,
    });

    // Convierte esa URI en una imagen Data URL (base64) que el Frontend puede mostrar
    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return {
      secret,
      qrCodeUrl,
    };
  }

  /**
   * Valida un código de 6 dígitos ingresado por el usuario.
   */
  public isMfaCodeValid(mfaCode: string, user: User): boolean {
    if (!user.mfaSecret) return false;

    const result = verifySync({
      token: mfaCode,
      secret: user.mfaSecret,
    });
    return result.valid;
  }
}