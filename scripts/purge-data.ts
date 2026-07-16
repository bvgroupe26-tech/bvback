/**
 * Purge toutes les données transactionnelles.
 * Conserve : users + employes
 * Supprime  : paie, présences, absences, compétences, formations, évaluations,
 *             activité, documents RH, notifications, push subscriptions,
 *             refresh tokens, offres/candidatures, budget, postes référentiel
 *
 * Usage : npx tsx scripts/purge-data.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('⚠️  Début de la purge — users et employes seront conservés.\n');

  const results = await prisma.$transaction([
    // Tokens / sessions
    prisma.refreshToken.deleteMany({}),
    prisma.pushSubscription.deleteMany({}),

    // Notifications
    prisma.notification.deleteMany({}),

    // Activité
    prisma.activiteLog.deleteMany({}),

    // RH transactionnel (cascade depuis employe)
    prisma.paie.deleteMany({}),
    prisma.presence.deleteMany({}),
    prisma.absence.deleteMany({}),
    prisma.competence.deleteMany({}),
    prisma.formation.deleteMany({}),
    prisma.evaluation.deleteMany({}),
    prisma.documentRh.deleteMany({}),

    // Recrutement (candidatures en cascade depuis offreEmploi)
    prisma.candidature.deleteMany({}),
    prisma.offreEmploi.deleteMany({}),

    // Budget (dépenses en cascade depuis enveloppe)
    prisma.budgetDepense.deleteMany({}),
    prisma.budgetEnveloppe.deleteMany({}),
    prisma.budgetCategorie.deleteMany({}),

  ]);

  const labels = [
    'refresh_tokens',
    'push_subscriptions',
    'notifications',
    'activite_log',
    'paie',
    'presences',
    'absences',
    'competences',
    'formations',
    'evaluations',
    'documents_rh',
    'candidatures',
    'offres_emploi',
    'budget_depenses',
    'budget_enveloppes',
    'budget_categories',
  ];

  results.forEach((r, i) => {
    console.log(`  ✓ ${labels[i].padEnd(22)} — ${r.count} ligne(s) supprimée(s)`);
  });

  const usersLeft    = await prisma.user.count();
  const employesLeft = await prisma.employe.count();
  console.log(`\n✅ Purge terminée.`);
  console.log(`   Users conservés   : ${usersLeft}`);
  console.log(`   Employés conservés : ${employesLeft}`);
}

main()
  .catch((e) => { console.error('❌ Erreur :', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
