import {
  Injectable,
  ConflictException,
  NotFoundException,
  OnModuleInit,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from './entities/user.entity';

@Injectable()
export class UsersService implements OnModuleInit{
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  // 1. Crear el primer usuario administrador por defecto
  async onModuleInit() {
    const count = await this.userRepository.count();
    
    // Si la base de datos de usuarios está vacía, creamos el primer admin
    if (count === 0) {
      this.logger.log('Base de datos de usuarios vacía. Creando usuario administrador por defecto...');
      const adminUsername = this.configService.get<string>('DEFAULT_ADMIN_USER', 'admin');
      const adminPassword = this.configService.get<string>('DEFAULT_ADMIN_PASSWORD', 'Admin1234!');
      const adminEmail = this.configService.get<string>('DEFAULT_ADMIN_EMAIL');
      await this.create(adminUsername, adminPassword, UserRole.ADMIN, adminEmail);
      this.logger.log(`Usuario "${adminUsername}" creado con éxito a partir de las variables de entorno.`);
    }
  }

  // 2. Buscar usuario por nombre (Usado en el Login)
  async findOneByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { username } });
  }

  // 3. Buscar usuario por ID (Usado por el JwtStrategy y MFA)
  async findOneById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  // 4. Crear un nuevo usuario
  async create(
    username: string,
    passwordPlain: string,
    role: UserRole,
    email?: string | null,
  ): Promise<User> {
    const existingUser = await this.findOneByUsername(username);
    if (existingUser) {
      throw new ConflictException('El nombre de usuario ya está en uso');
    }

    const normalizedEmail = email?.trim() || null;
    if (role === UserRole.USER && !normalizedEmail) {
      throw new BadRequestException(
        'Los usuarios agente (rol user) deben tener `email` para el código MFA.',
      );
    }
    if (normalizedEmail) {
      const emailTaken = await this.userRepository.findOne({
        where: { email: normalizedEmail },
      });
      if (emailTaken) {
        throw new ConflictException('El correo electrónico ya está en uso');
      }
    }

    // Hasheamos la contraseña antes de guardarla
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds);
    const passwordHash = await bcrypt.hash(passwordPlain, salt);

    // Creamos y guardamos el usuario
    const newUser = this.userRepository.create({
      username,
      email: normalizedEmail,
      passwordHash,
      role,
      isMfaEnabled: false,
    });

    return this.userRepository.save(newUser);
  }

  /** Activa MFA y limpia cualquier reto pendiente en `mfaSecret`. */
  async enableMfa(userId: string): Promise<void> {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.isMfaEnabled = true;
    user.mfaSecret = null;
    await this.userRepository.save(user);
  }

  /** Guarda el reto MFA en `mfaSecret` como `caducidadMs|hashBcrypt`. */
  async setMfaSecretChallenge(userId: string, mfaSecretPayload: string): Promise<void> {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }
    user.mfaSecret = mfaSecretPayload;
    await this.userRepository.save(user);
  }

  /**
   * Valida el código MFA recibido por correo y borra `mfaSecret` si coincide.
   */
  async verifyAndConsumeMfaCode(userId: string, plainCode: string): Promise<User | null> {
    const user = await this.findOneById(userId);
    if (!user || !user.isMfaEnabled) {
      return null;
    }
    if (!user.mfaSecret?.includes('|')) {
      return null;
    }
    const pipe = user.mfaSecret.indexOf('|');
    const expMs = Number.parseInt(user.mfaSecret.slice(0, pipe), 10);
    const hash = user.mfaSecret.slice(pipe + 1);
    if (!Number.isFinite(expMs) || !hash) {
      return null;
    }
    if (Date.now() > expMs) {
      return null;
    }
    const match = await bcrypt.compare(plainCode, hash);
    if (!match) {
      return null;
    }
    user.mfaSecret = null;
    await this.userRepository.save(user);
    return user;
  }

  async disableMfa(userId: string): Promise<void> {
    const user = await this.findOneById(userId);
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    user.mfaSecret = null;
    user.isMfaEnabled = false;

    await this.userRepository.save(user);
  }
}
