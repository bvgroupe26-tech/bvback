import { User, UserRole } from '@prisma/client';

export type UserPayload = Omit<User, 'passwordHash'>;

/** Profil renvoyé au client (login, /auth/me) avec fiche RH liée si employé. */
export type UserMePayload = UserPayload & {
  employeId?: number | null;
  matricule?: string | null;
  poste?: string | null;
  departement?: string | null;
  avatar?: string | null;
};

export interface JwtPayload {
  sub: number;
  email: string;
  role: UserRole;
  nom: string;
  prenom: string;
}

export interface AuthTokenResponse {
  access_token: string;
  user: UserMePayload;
}
