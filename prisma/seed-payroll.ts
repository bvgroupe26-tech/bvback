/**
 * Rubriques de paie standard et paramètres associés, SANS valeurs légales.
 * Les taux, plafonds et barèmes sont créés à 0 avec la mention « À CONFIRMER » :
 * ils doivent être saisis par le comptable avant tout calcul avec le moteur v2.
 *
 * N'écrase jamais une rubrique ou un paramètre déjà présent.
 * Usage : npm run seed:payroll
 *
 * Codes de base agrégés calculés par le moteur (non stockés) :
 *   BRUT, BRUT_IMPOSABLE, BRUT_CNSS, NET_IMPOSABLE, TAUX_HORAIRE.
 */
import {
  ModeCalculRubrique,
  Prisma,
  PrismaClient,
  TypeRubrique,
} from '@prisma/client';

const prisma = new PrismaClient();

const A_CONFIRMER = 'À CONFIRMER par le comptable / la convention collective';

type RuleSeed = Omit<Prisma.PayRuleCreateInput, 'code'> & { code: string };

const RULES: RuleSeed[] = [
  { code: 'SAL_BASE', libelle: 'Salaire de base', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 10, imposable: true, soumisCnss: true },
  { code: 'SURSALAIRE', libelle: 'Sursalaire', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 20, imposable: true, soumisCnss: true },
  { code: 'PRIME_ANCIENNETE', libelle: "Prime d'ancienneté", type: TypeRubrique.gain, mode: ModeCalculRubrique.base_x_taux, baseCode: 'SAL_BASE', tauxSalarialCode: 'TX_ANCIENNETE', ordre: 30, imposable: true, soumisCnss: true, description: `Taux selon ancienneté — ${A_CONFIRMER}` },
  { code: 'HS_1', libelle: 'Heures supplémentaires (tranche 1)', type: TypeRubrique.gain, mode: ModeCalculRubrique.variable, baseCode: 'TAUX_HORAIRE', tauxSalarialCode: 'MAJ_HS_1', ordre: 40, imposable: true, soumisCnss: true },
  { code: 'HS_2', libelle: 'Heures supplémentaires (tranche 2)', type: TypeRubrique.gain, mode: ModeCalculRubrique.variable, baseCode: 'TAUX_HORAIRE', tauxSalarialCode: 'MAJ_HS_2', ordre: 41, imposable: true, soumisCnss: true },
  { code: 'HS_3', libelle: 'Heures supplémentaires (nuit / dimanche / férié)', type: TypeRubrique.gain, mode: ModeCalculRubrique.variable, baseCode: 'TAUX_HORAIRE', tauxSalarialCode: 'MAJ_HS_3', ordre: 42, imposable: true, soumisCnss: true },
  { code: 'IND_TRANSPORT', libelle: 'Indemnité de transport', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 50, imposable: false, soumisCnss: false, description: `Imposable / soumise CNSS : ${A_CONFIRMER}` },
  { code: 'IND_LOGEMENT', libelle: 'Indemnité de logement', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 51, imposable: false, soumisCnss: false, description: `Imposable / soumise CNSS : ${A_CONFIRMER}` },
  { code: 'PRIME_PERFORMANCE', libelle: 'Prime de performance', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 52, imposable: true, soumisCnss: true },
  { code: 'AUTRES_PRIMES', libelle: 'Autres primes', type: TypeRubrique.gain, mode: ModeCalculRubrique.fixe, ordre: 53, imposable: true, soumisCnss: true },
  { code: 'ABS_NON_PAYEE', libelle: 'Absences non rémunérées', type: TypeRubrique.retenue, mode: ModeCalculRubrique.variable, baseCode: 'SAL_BASE', ordre: 60, imposable: true, soumisCnss: true, description: 'Réduit le brut (jours sans solde, absences injustifiées) ; base de prorata : paramètre BASE_JOURS_MOIS.' },
  { code: 'CNSS_PENSION', libelle: 'CNSS — pension vieillesse', type: TypeRubrique.cotisation, mode: ModeCalculRubrique.base_x_taux, baseCode: 'BRUT_CNSS', tauxSalarialCode: 'TX_CNSS_PENSION_SAL', tauxPatronalCode: 'TX_CNSS_PENSION_PAT', plafondCode: 'PLAF_CNSS_PENSION', ordre: 100 },
  { code: 'CNSS_PF', libelle: 'CNSS — prestations familiales', type: TypeRubrique.cotisation, mode: ModeCalculRubrique.base_x_taux, baseCode: 'BRUT_CNSS', tauxPatronalCode: 'TX_CNSS_PF_PAT', plafondCode: 'PLAF_CNSS_PF', ordre: 110 },
  { code: 'CNSS_AT', libelle: 'CNSS — accidents du travail', type: TypeRubrique.cotisation, mode: ModeCalculRubrique.base_x_taux, baseCode: 'BRUT_CNSS', tauxPatronalCode: 'TX_CNSS_AT_PAT', plafondCode: 'PLAF_CNSS_AT', ordre: 120 },
  { code: 'CAMU', libelle: 'CAMU', type: TypeRubrique.cotisation, mode: ModeCalculRubrique.base_x_taux, baseCode: 'BRUT', tauxSalarialCode: 'TX_CAMU_SAL', tauxPatronalCode: 'TX_CAMU_PAT', ordre: 130, description: `Assiette et taux : ${A_CONFIRMER}` },
  { code: 'TUS', libelle: 'Taxe unique sur les salaires (TUS)', type: TypeRubrique.impot, mode: ModeCalculRubrique.base_x_taux, baseCode: 'BRUT', tauxPatronalCode: 'TX_TUS_PAT', ordre: 140, description: `Part patronale : ${A_CONFIRMER}` },
  { code: 'IRPP', libelle: 'IRPP', type: TypeRubrique.impot, mode: ModeCalculRubrique.bareme, baseCode: 'NET_IMPOSABLE', baremeCode: 'IRPP', ordre: 200, description: `Barème, abattement (ABATTEMENT_FRAIS_PRO) et quotient familial : ${A_CONFIRMER}` },
  { code: 'TOL', libelle: 'Taxe sur l’occupation des locaux (TOL)', type: TypeRubrique.impot, mode: ModeCalculRubrique.fixe, tauxSalarialCode: 'MT_TOL', ordre: 210, description: `Montant fixe et redevable : ${A_CONFIRMER}` },
  { code: 'AVANCE', libelle: 'Avance / acompte sur salaire', type: TypeRubrique.retenue, mode: ModeCalculRubrique.variable, ordre: 300 },
  { code: 'PRET', libelle: 'Remboursement de prêt', type: TypeRubrique.retenue, mode: ModeCalculRubrique.variable, ordre: 310 },
];

const PARAMETERS: Array<{ code: string; description: string }> = [
  { code: 'TX_ANCIENNETE', description: "Taux de prime d'ancienneté (%)" },
  { code: 'MAJ_HS_1', description: 'Majoration heures sup tranche 1 (%)' },
  { code: 'MAJ_HS_2', description: 'Majoration heures sup tranche 2 (%)' },
  { code: 'MAJ_HS_3', description: 'Majoration heures sup nuit / dimanche / férié (%)' },
  { code: 'TX_CNSS_PENSION_SAL', description: 'CNSS pension — taux salarial (%)' },
  { code: 'TX_CNSS_PENSION_PAT', description: 'CNSS pension — taux patronal (%)' },
  { code: 'PLAF_CNSS_PENSION', description: 'CNSS pension — plafond mensuel (FCFA)' },
  { code: 'TX_CNSS_PF_PAT', description: 'CNSS prestations familiales — taux patronal (%)' },
  { code: 'PLAF_CNSS_PF', description: 'CNSS prestations familiales — plafond mensuel (FCFA)' },
  { code: 'TX_CNSS_AT_PAT', description: 'CNSS accidents du travail — taux patronal (%)' },
  { code: 'PLAF_CNSS_AT', description: 'CNSS accidents du travail — plafond mensuel (FCFA)' },
  { code: 'TX_CAMU_SAL', description: 'CAMU — taux salarial (%)' },
  { code: 'TX_CAMU_PAT', description: 'CAMU — taux patronal (%)' },
  { code: 'TX_TUS_PAT', description: 'TUS — taux patronal (%)' },
  { code: 'MT_TOL', description: 'TOL — montant mensuel (FCFA)' },
  { code: 'ABATTEMENT_FRAIS_PRO', description: 'IRPP — abattement forfaitaire frais professionnels (%)' },
  { code: 'SMIG', description: 'SMIG mensuel (FCFA)' },
  { code: 'BASE_JOURS_MOIS', description: 'Base de prorata : nombre de jours par mois' },
  { code: 'HEURES_MOIS', description: 'Heures mensuelles de référence (taux horaire)' },
  { code: 'PRORATA_MODE', description: 'Mode de prorata : 0 = base fixe (BASE_JOURS_MOIS), 1 = jours calendaires, 2 = jours ouvrés' },
  { code: 'IRPP_ANNUALISER', description: 'IRPP : 1 = calcul annualisé (×12 puis ÷12), 0 = barème mensuel' },
  { code: 'HS_SEUIL_TRANCHE1_SEMAINE', description: 'Heures sup : nombre d’heures par semaine payées en tranche 1, au-delà en tranche 2' },
  { code: 'QF_PARTS_CELIBATAIRE', description: 'Quotient familial : parts d’un célibataire / divorcé / veuf' },
  { code: 'QF_PARTS_MARIE', description: 'Quotient familial : parts d’un salarié marié' },
  { code: 'QF_PART_PAR_ENFANT', description: 'Quotient familial : parts par enfant à charge' },
  { code: 'QF_PARTS_MAX', description: 'Quotient familial : nombre maximal de parts' },
];

const DATE_DEBUT = new Date(Date.UTC(2026, 0, 1));

async function main(): Promise<void> {
  let rulesCreated = 0;
  for (const rule of RULES) {
    const existing = await prisma.payRule.findUnique({ where: { code: rule.code } });
    if (existing) continue;
    await prisma.payRule.create({ data: rule });
    rulesCreated++;
  }

  let paramsCreated = 0;
  for (const p of PARAMETERS) {
    const existing = await prisma.payParameter.findFirst({ where: { code: p.code } });
    if (existing) continue;
    await prisma.payParameter.create({
      data: {
        code: p.code,
        valeur: 0,
        dateDebut: DATE_DEBUT,
        description: `${p.description} — ${A_CONFIRMER}`,
      },
    });
    paramsCreated++;
  }

  console.log(
    `seed-payroll : ${rulesCreated} rubrique(s) et ${paramsCreated} paramètre(s) créés. ` +
      'Aucun taux légal saisi : compléter les paramètres et le barème IRPP avant le calcul v2.',
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
