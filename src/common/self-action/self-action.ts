import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { findEmployeIdForUser } from '../employe-link/employe-link';

/** Vrai si la fiche `employeId` est celle du compte `actorUserId`. */
export async function isOwnEmploye(
  prisma: PrismaService,
  actorUserId: number,
  employeId: number | null | undefined,
): Promise<boolean> {
  if (!employeId) return false;
  const ownId = await findEmployeIdForUser(prisma, { id: actorUserId });
  return ownId !== null && ownId === employeId;
}

/**
 * Séparation des pouvoirs : un membre du staff ne traite jamais un dossier qui le concerne
 * (validation, rémunération, paiement). Aucune dérogation, admin compris.
 * `action` complète « Vous ne pouvez pas … », ex. « valider votre propre demande d'absence ».
 */
export async function assertNotSelf(
  prisma: PrismaService,
  actorUserId: number,
  employeId: number | null | undefined,
  action: string,
): Promise<void> {
  if (await isOwnEmploye(prisma, actorUserId, employeId)) {
    throw new ForbiddenException(
      `Vous ne pouvez pas ${action} : la demande doit être traitée par un autre membre RH ou administrateur.`,
    );
  }
}

/** Champs qu'un membre du staff peut modifier sur sa propre fiche via les routes RH. */
export const SELF_EDITABLE_EMPLOYE_FIELDS = ['telephone', 'adresse', 'situationFamiliale'] as const;
