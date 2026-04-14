// src/users/entities/user.entity.ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  /** Correo para códigos MFA (obligatorio para agentes). `username` debe coincidir con `record.agent`. */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | null;

  @Column()
  passwordHash: string; // Guardado usando bcrypt

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role: UserRole;

  @Column({ default: false })
  isMfaEnabled: boolean;

  /** MFA por correo: reto pendiente como `caducidadEnMs|hashBcrypt`. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  mfaSecret: string | null;
}
