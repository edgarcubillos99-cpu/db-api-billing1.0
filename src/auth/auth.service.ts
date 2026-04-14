import { Injectable } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 1. Validar credenciales del usuario
   * Busca al usuario por su username y compara la contraseña en texto plano
   * con el hash almacenado en la base de datos.
   */
  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUsername(username);
    
    // Si el usuario existe y la contraseña coincide
    if (user && await bcrypt.compare(pass, user.passwordHash)) {
      // Usamos desestructuración para separar el passwordHash del resto de los datos.
      // Así evitamos que el hash viaje en la memoria de los siguientes pasos.
      const { passwordHash, ...result } = user;
      return result; // Retorna el usuario sin la contraseña
    }
    
    return null; // Si falla, retorna null
  }

  /**
   * 2. Generar el token JWT
   * Toma el usuario validado y crea un payload firmado que se enviará al cliente.
   */
  async login(user: any) {
    // El 'sub' (subject) es el estándar en JWT para almacenar el ID del usuario
    const payload = {
      username: user.username,
      sub: user.id,
      role: user.role,
      email: user.email ?? null,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email ?? null,
        role: user.role,
      },
    };
  }

  /**
   * 3. Buscar usuario por ID
   * durante el segundo paso del MFA (verifyMfa) en el AuthController.
   */
  async findById(userId: string) {
    return this.usersService.findOneById(userId);
  }
}