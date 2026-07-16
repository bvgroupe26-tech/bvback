import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EMAIL = 'rh@bvgroupe.com';

async function main() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL } });
  if (!user) {
    console.log(`Aucun utilisateur trouvé avec l'email : ${EMAIL}`);
    return;
  }

  console.log(`Trouvé : ${user.prenom} ${user.nom} (id=${user.id}, rôle=${user.role})`);

  // Supprime les dépendances (cascade non garantie sur hard delete)
  await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  await prisma.pushSubscription.deleteMany({ where: { userId: user.id } });
  await prisma.notification.deleteMany({ where: { userId: user.id } });

  await prisma.user.delete({ where: { id: user.id } });

  console.log(`✅ Utilisateur ${EMAIL} supprimé définitivement.`);
}

main()
  .catch((e) => { console.error('❌', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
