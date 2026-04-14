import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  UseGuards,
  Req,
  Get,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from './guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from './decorators/roles.decorator';
import { MfaDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';
import { ResetMfaDto } from './dto/reset-mfa.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly mfaService: MfaService,
  ) {}

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario (Requiere token)' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente.' })
  @ApiResponse({ status: 409, description: 'El nombre de usuario o el correo ya existen.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  async register(@Body() authCredentialsDto: LoginDto) {
    const { username, password } = authCredentialsDto;

    if (!authCredentialsDto.email?.trim()) {
      throw new BadRequestException(
        'Los agentes deben incluir `email` (código MFA). El `username` debe coincidir con el valor de `agent` en los registros.',
      );
    }

    const newUser = await this.usersService.create(
      username,
      password,
      UserRole.USER,
      authCredentialsDto.email,
    );

    return {
      message: 'Usuario creado exitosamente',
      userId: newUser.id,
      username: newUser.username,
      email: newUser.email,
    };
  }

  @Post('login')
  @ApiOperation({ summary: 'Iniciar sesión y obtener token JWT' })
  @ApiResponse({ status: 200, description: 'Login exitoso.' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async login(@Body() authCredentialsDto: LoginDto) {
    const { username, password } = authCredentialsDto;
    
    // 1. Validamos que el usuario y la contraseña sean correctos
    const user = await this.authService.validateUser(username, password);
    
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. MFA: el código solo se envía al `email`
    if (user.isMfaEnabled) {
      if (!user.email?.trim()) {
        throw new BadRequestException(
          'MFA está activo pero el usuario no tiene `email` configurado. Contacta a un administrador.',
        );
      }
      try {
        await this.mfaService.issueEmailOtpAndSend(user);
      } catch (err) {
        if (
          err instanceof BadRequestException ||
          err instanceof ServiceUnavailableException
        ) {
          throw err;
        }
        throw new BadRequestException(
          'No se pudo enviar el código MFA. Revisa la configuración SMTP o los logs del servidor.',
        );
      }
      return {
        mfaRequired: true,
        userId: user.id,
        message: 'Se ha enviado un código de verificación al correo asociado a tu usuario.',
      };
    }
    
    // 3. Si no tiene MFA, generamos y devolvemos el token JWT directamente
    return this.authService.login(user);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('mfa/generate')
  @ApiOperation({
    summary:
      'Activar MFA por correo electrónico (sin QR; opcionalmente envía correo de confirmación si SMTP está configurado)',
  })
  async generateMfaSecret(@Req() req: any) {
    const user = await this.usersService.findOneById(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    if (!user.email?.trim()) {
      throw new BadRequestException(
        'Configura el campo `email` para recibir códigos MFA. El `username` debe coincidir con `record.agent` para el aislamiento de datos.',
      );
    }

    await this.usersService.enableMfa(user.id);
    return this.mfaService.prepareMfaActivationResponse(user);
  }

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verificar código MFA recibido por correo electrónico' })
  async verifyMfa(@Body() mfaDto: MfaDto) {
    const user = await this.usersService.verifyAndConsumeMfaCode(
      mfaDto.userId,
      mfaDto.mfaCode,
    );

    if (!user) {
      throw new UnauthorizedException('Código MFA inválido o expirado');
    }

    return this.authService.login(user);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard) // <-- 1. Valida el token
  @Roles(UserRole.ADMIN)                   // <-- 2. Exige que sea ADMIN
  @Post('mfa/reset-for-user')
  @ApiOperation({ summary: 'Desactivar el MFA por correo de un usuario (solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'MFA reseteado con éxito.' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador.' })
  async resetMfaForUser(@Body() resetMfaDto: ResetMfaDto) {
    
    await this.usersService.disableMfa(resetMfaDto.userId);
    
    return {
      message:
        'MFA desactivado. El usuario puede iniciar sesión solo con contraseña o volver a activar MFA por correo.',
      userIdReseteado: resetMfaDto.userId,
    };
  }
}

