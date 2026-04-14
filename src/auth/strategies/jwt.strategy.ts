import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../../users/users.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly usersService: UsersService, private readonly configService: ConfigService) {
    super({
      // Extrae el token del header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // Rechaza tokens expirados
      secretOrKey: configService.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findOneById(payload.sub);
    if (!user) throw new UnauthorizedException('Usuario no encontrado o inactivo');

    return {
      userId: user.id,
      username: user.username,
      email: user.email ?? null,
      role: user.role,
    };
  }
}