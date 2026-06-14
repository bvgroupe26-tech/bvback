import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const VALID_ROLES = Object.values(UserRole) as string[];

async function main() {
  const [email, role] = process.argv.slice(2);

  if (!email || !role) {
    console.error('Usage : npx ts-node scripts/set-user-role.ts <email> <role>');
    console.error(`Rôles valides : ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  if (!VALID_ROLES.includes(role)) {
    console.error(`Rôle invalide « ${role} ». Rôles valides : ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const user = await prisma.user.findFirst({ where: { email } });

  if (!user) {
    console.error(`Aucun utilisateur trouvé avec l'email « ${email} »`);
    process.exit(1);
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: role as UserRole },
    select: { id: true, email: true, nom: true, prenom: true, role: true },
  });

  console.log('Rôle mis à jour :');
  console.table([updated]);
  console.log(
    "Important : l'utilisateur doit se reconnecter pour obtenir un nouveau JWT avec le rôle à jour.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
