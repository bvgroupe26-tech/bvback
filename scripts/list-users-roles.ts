import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      nom: true,
      prenom: true,
      role: true,
      isActive: true,
      deletedAt: true,
    },
    orderBy: { id: 'asc' },
  });

  console.table(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      nom: u.nom,
      prenom: u.prenom,
      role: u.role,
      isActive: u.isActive,
      supprime: u.deletedAt ? 'oui' : 'non',
    })),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
