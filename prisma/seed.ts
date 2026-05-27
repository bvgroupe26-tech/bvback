import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@bvgroupe.com';
const ADMIN_PASSWORD = 'Admin@2026';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);

  const existing = await prisma.user.findFirst({
    where: { email: ADMIN_EMAIL, deletedAt: null },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
  } else {
    await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        nom: 'Administrateur',
        prenom: 'BV Groupe',
        role: UserRole.admin,
      },
    });
  }

  console.log(`Compte admin prêt : ${ADMIN_EMAIL}`);
}

main()
  .catch((error: unknown) => {
    console.error('Erreur lors du seed :', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
