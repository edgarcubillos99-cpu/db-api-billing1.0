import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, Length, IsUUID, Matches } from 'class-validator';

export class MfaDto {
  @ApiProperty({ example: '1c571b5a-21c2-4753-a1e1-a08ae9ae60e7', description: 'ID del usuario devuelto en el paso 1 del login' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos recibido por correo electrónico' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  mfaCode: string;
}