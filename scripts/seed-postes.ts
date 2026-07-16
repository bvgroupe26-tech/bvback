import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const POSTES = [
  'Administrateur',
  'Assistant administratif',
  'Assistante de Service',
  'Bibliothécaire',
  'Chargé de recrutement',
  'Chef de projet',
  'Community Manager',
  'Comptable',
  'Développeur',
  'Développeur Senior',
  'Directeur général',
  'Documentaliste',
  'Informaticien',
  'Responsable commercial',
  'Responsable RH',
  'Technicien support',
];

async function main() {
  const existing = await prisma.posteReferentiel.findMany({ select: { label: true } });
  const existingLabels = new Set(existing.map((r) => r.label.toLowerCase()));

  let inserted = 0;
  let skipped = 0;

  for (const label of POSTES) {
    if (existingLabels.has(label.toLowerCase())) {
      console.log('  ⏭  déjà présent  :', label);
      skipped++;
    } else {
      await prisma.posteReferentiel.create({ data: { label } });
      console.log('  ✓  inséré        :', label);
      inserted++;
    }
  }

  console.log(`\n✅ Terminé — ${inserted} inséré(s), ${skipped} ignoré(s).`);
  const total = await prisma.posteReferentiel.count();
  console.log(`   Total en base   : ${total} poste(s)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
