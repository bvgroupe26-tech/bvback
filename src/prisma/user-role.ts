/**
 * Miroir de l’enum Prisma `UserRole` (prisma/schema.prisma).
 * Les DTO importent ce module pour éviter l’erreur TS quand le client généré
 * n’est pas encore résolu (« Module @prisma/client has no exported member UserRole »).
 */
export const USER_ROLE = {
  admin: 'admin',
  manager: 'manager',
  rh: 'rh',
  employee: 'employee',
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];
