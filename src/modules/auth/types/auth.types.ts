import { User, UserRole } from '@prisma/client';

export type UserPayload = Omit<User, 'passwordHash'>;

/** Profil renvoyé au client (login, /auth/me) avec fiche RH liée si employé. */
export type UserMePayload = UserPayload & {
  /** Vrai si le compte (staff compris) a une fiche employé : accès à « Mon espace employé ». */
  hasEmployeProfile?: boolean;
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
  accessToken: string;
  /** @deprecated Utiliser accessToken — conservé pour compatibilité clients existants */
  access_token: string;
  user: UserMePayload;
}

/** Résultat interne incluant le refresh token (cookie uniquement, jamais exposé au client). */
export interface AuthLoginResult extends AuthTokenResponse {
  refreshToken: string;
}
