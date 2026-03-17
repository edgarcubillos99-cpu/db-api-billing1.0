import { Controller, Post, Body, UnauthorizedException, UseGuards, Req, Get } from '@nestjs/common';
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
  @ApiResponse({ status: 409, description: 'El nombre de usuario ya existe.' })
  @ApiResponse({ status: 401, description: 'No autorizado.' })
  async register(@Body() authCredentialsDto: LoginDto) {
    const { username, password } = authCredentialsDto;
    
    // Al no pasar un tercer parámetro, los usuarios creados aquí serán Role.USER por defecto
    const newUser = await this.usersService.create(username, password, UserRole.USER);
    
    return {
      message: 'Usuario creado exitosamente',
      userId: newUser.id,
      username: newUser.username
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

    // 2. Verificamos si tiene MFA activo
    if (user.isMfaEnabled) {
      return { 
        mfaRequired: true, 
        userId: user.id, 
        message: 'Se requiere verificación de dos pasos (MFA)' 
      }; 
    }
    
    // 3. Si no tiene MFA, generamos y devolvemos el token JWT directamente
    return this.authService.login(user);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Get('mfa/generate')
  @ApiOperation({ summary: 'Generar código QR para activar MFA (Microsoft Authenticator u otra app TOTP)' })
  async generateMfaSecret(@Req() req: any) {
    // 1. Buscamos al usuario en base a su token
    const user = await this.usersService.findOneById(req.user.userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // 2. Generamos el secreto y el QR
    const { secret, qrCodeUrl } = await this.mfaService.generateMfaSecret(user);
    
    // 3. Guardamos el secreto en la base de datos (y activamos el MFA)
    await this.usersService.enableMfa(user.id, secret);

    return {
      message: 'Escanea el código QR con Microsoft Authenticator (o cualquier app TOTP compatible)',
      qrCodeUrl // Esto es un string base64 que puedes poner en un tag <img> en el frontend
    };
  }

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verificar código MFA' })
  async verifyMfa(@Body() mfaDto: MfaDto) { // <-- Ya no pedimos @Req() req
    // Usamos el userId que viene en el Body de la petición
    const user = await this.usersService.findOneById(mfaDto.userId);
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const isValid = this.mfaService.isMfaCodeValid(mfaDto.mfaCode, user);
    
    if (!isValid) {
      throw new UnauthorizedException('Código MFA inválido');
    }

    // Aquí le devolvemos el token definitivo para que por fin pueda entrar
    return this.authService.login(user); 
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'), RolesGuard) // <-- 1. Valida el token
  @Roles(UserRole.ADMIN)                   // <-- 2. Exige que sea ADMIN
  @Post('mfa/reset-for-user')
  @ApiOperation({ summary: 'Apagar el MFA de un usuario que perdió su celular (Solo ADMIN)' })
  @ApiResponse({ status: 200, description: 'MFA reseteado con éxito.' })
  @ApiResponse({ status: 403, description: 'No tienes permisos de Administrador.' })
  async resetMfaForUser(@Body() resetMfaDto: ResetMfaDto) {
    
    await this.usersService.disableMfa(resetMfaDto.userId);
    
    return { 
      message: 'MFA desactivado. El usuario ya puede iniciar sesión con su contraseña y generar un nuevo código QR.',
      userIdReseteado: resetMfaDto.userId
    };
  }
}

