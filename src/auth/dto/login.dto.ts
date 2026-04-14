import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({
    description:
      'Nombre de usuario = identificador en `record.agent` (bloqueo por agente). No tiene por qué ser un correo.',
    example: 'agente_04',
  })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'Contraseña', example: 'secret123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiPropertyOptional({
    description:
      'Correo para MFA. Obligatorio al registrar agentes (`POST /auth/register`). No sustituye a `username` en el filtro por `record.agent`.',
    example: 'agente@empresa.com',
  })
  @IsOptional()
  @IsEmail()
  email?: string;
}
