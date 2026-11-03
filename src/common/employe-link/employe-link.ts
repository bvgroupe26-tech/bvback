import { NotFoundException } from '@nestjs/common';
import { Employe, Prisma } from '@prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';

export function normalizeEmail(email: string): string;
export function normalizeEmail(email: string | null | undefined): string | null | undefined;
export function normalizeEmail(email: string | null | undefined): string | null | undefined {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

/**
 * Seul point de résolution compte → fiche employé : par `userId`, sinon par email
 * (casse ignorée) sur une fiche encore non liée, qui est alors rattachée au compte.
 */
export async function findEmployeForUser(
  prisma: PrismaService,
  user: { id: number; email?: string | null },
): Promise<Employe | null> {
  const linked = await prisma.employe.findFirst({ where: { userId: user.id } });
  if (linked) return linked;

  let email = user.email;
  if (email === undefined) {
    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { email: true },
    });
    email = row?.email;
  }
  if (!email) return null;

  const byEmail = await prisma.employe.findFirst({
    where: { userId: null, email: { equals: email.trim(), mode: 'insensitive' } },
    orderBy: { id: 'asc' },
  });
  if (!byEmail) return null;

  try {
    return await prisma.employe.update({
      where: { id: byEmail.id },
      data: { userId: user.id },
    });
  } catch (error) {
    // Lien posé en parallèle par une autre requête : relire.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.employe.findFirst({ where: { userId: user.id } });
    }
    throw error;
  }
}

export async function requireEmployeForUser(
  prisma: PrismaService,
  userId: number,
): Promise<Employe> {
  const employe = await findEmployeForUser(prisma, { id: userId });
  if (!employe) {
    throw new NotFoundException('Aucun employé associé à ce compte utilisateur');
  }
  return employe;
}

export async function findEmployeIdForUser(
  prisma: PrismaService,
  user: { id: number; email?: string | null },
): Promise<number | null> {
  return (await findEmployeForUser(prisma, user))?.id ?? null;
}

export async function findUserIdForEmploye(
  prisma: PrismaService,
  employeId: number,
): Promise<number | null> {
  const employe = await prisma.employe.findUnique({
    where: { id: employeId },
    select: { userId: true, email: true },
  });
  if (!employe) return null;
  if (employe.userId) return employe.userId;
  if (!employe.email) return null;

  const user = await prisma.user.findFirst({
    where: { email: { equals: employe.email.trim(), mode: 'insensitive' } },
    orderBy: { id: 'asc' },
    select: { id: true },
  });
  return user?.id ?? null;
}
