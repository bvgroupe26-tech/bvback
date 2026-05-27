-- CreateEnum
CREATE TYPE "SituationFamiliale" AS ENUM ('celibataire', 'marie', 'divorce', 'veuf');

-- CreateEnum
CREATE TYPE "TypeContrat" AS ENUM ('CDI', 'CDD', 'Stage', 'Freelance', 'Interim');

-- CreateEnum
CREATE TYPE "TypeContratOffre" AS ENUM ('CDI', 'CDD', 'Stage', 'Freelance');

-- CreateEnum
CREATE TYPE "StatutEmploye" AS ENUM ('actif', 'inactif', 'suspendu');

-- CreateEnum
CREATE TYPE "StatutPresence" AS ENUM ('present', 'absent', 'retard', 'conge', 'mission');

-- CreateEnum
CREATE TYPE "TypeAbsence" AS ENUM ('maladie', 'conge_paye', 'conge_sans_solde', 'maternite', 'paternite', 'autre');

-- CreateEnum
CREATE TYPE "StatutAbsence" AS ENUM ('en_attente', 'approuve', 'refuse');

-- CreateEnum
CREATE TYPE "StatutPaie" AS ENUM ('en_attente', 'paye', 'annule');

-- CreateEnum
CREATE TYPE "StatutOffreEmploi" AS ENUM ('ouverte', 'fermee', 'pourvue');

-- CreateEnum
CREATE TYPE "StatutCandidature" AS ENUM ('recu', 'en_cours', 'retenu', 'rejete');

-- CreateEnum
CREATE TYPE "NiveauCompetence" AS ENUM ('debutant', 'intermediaire', 'avance', 'expert');

-- CreateEnum
CREATE TYPE "TypeFormation" AS ENUM ('formation', 'certification', 'diplome');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'manager', 'rh');

-- CreateEnum
CREATE TYPE "StatutBudgetEnveloppe" AS ENUM ('actif', 'clos', 'brouillon');

-- CreateEnum
CREATE TYPE "StatutBudgetDepense" AS ENUM ('en_attente', 'approuve', 'refuse', 'paye');

-- CreateTable
CREATE TABLE "employes" (
    "id" SERIAL NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "situationFamiliale" "SituationFamiliale",
    "nombreEnfants" INTEGER NOT NULL DEFAULT 0,
    "typeContrat" "TypeContrat",
    "poste" TEXT,
    "departement" TEXT,
    "dateEmbauche" TIMESTAMP(3),
    "statut" "StatutEmploye" NOT NULL DEFAULT 'actif',
    "salaireBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defPrimeTransport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defPrimeLogement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defPrimePerformance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defAutresPrimes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defTauxCnss" DOUBLE PRECISION,
    "defTauxImpot" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "presences" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "heureEntree" TEXT,
    "heureSortie" TEXT,
    "statut" "StatutPresence" NOT NULL,
    "justification" TEXT,
    "heuresSupplementaires" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "presences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "typeAbsence" "TypeAbsence" NOT NULL,
    "justification" TEXT,
    "statut" "StatutAbsence" NOT NULL DEFAULT 'en_attente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paie" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "mois" TEXT NOT NULL,
    "annee" INTEGER NOT NULL,
    "salaireBase" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primeTransport" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primeLogement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "primePerformance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autresPrimes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cnss" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impot" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autresRetenues" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaireNet" DOUBLE PRECISION,
    "statut" "StatutPaie" NOT NULL DEFAULT 'en_attente',
    "datePaiement" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offres_emploi" (
    "id" SERIAL NOT NULL,
    "titre" TEXT NOT NULL,
    "departement" TEXT,
    "typeContrat" "TypeContratOffre" NOT NULL,
    "description" TEXT NOT NULL,
    "competencesRequises" TEXT,
    "cibleCandidats" INTEGER NOT NULL DEFAULT 10,
    "datePublication" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateCloture" TIMESTAMP(3),
    "statut" "StatutOffreEmploi" NOT NULL DEFAULT 'ouverte',

    CONSTRAINT "offres_emploi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidatures" (
    "id" SERIAL NOT NULL,
    "offreId" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT,
    "cvPath" TEXT,
    "lettreMotivation" TEXT,
    "statut" "StatutCandidature" NOT NULL DEFAULT 'recu',
    "dateCandidature" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competences" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "nomCompetence" TEXT NOT NULL,
    "niveau" "NiveauCompetence" NOT NULL,
    "categorie" TEXT,

    CONSTRAINT "competences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formations" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "TypeFormation" NOT NULL,
    "organisme" TEXT,
    "dateObtention" TIMESTAMP(3) NOT NULL,
    "dateExpiration" TIMESTAMP(3),
    "fichierPath" TEXT,

    CONSTRAINT "formations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluations" (
    "id" SERIAL NOT NULL,
    "employeId" INTEGER NOT NULL,
    "periode" TEXT NOT NULL,
    "noteGlobale" DOUBLE PRECISION,
    "ponctualite" DOUBLE PRECISION,
    "qualiteTravail" DOUBLE PRECISION,
    "travailEquipe" DOUBLE PRECISION,
    "initiative" DOUBLE PRECISION,
    "commentaire" TEXT,
    "evaluateur" TEXT,
    "dateEvaluation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activite_log" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "employeId" INTEGER,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activite_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'admin',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLogin" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_categories" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_enveloppes" (
    "id" SERIAL NOT NULL,
    "libelle" TEXT NOT NULL,
    "departement" TEXT,
    "annee" INTEGER NOT NULL,
    "montantPrevu" DOUBLE PRECISION NOT NULL,
    "statut" "StatutBudgetEnveloppe" NOT NULL DEFAULT 'actif',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_enveloppes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_depenses" (
    "id" SERIAL NOT NULL,
    "enveloppeId" INTEGER NOT NULL,
    "categorieId" INTEGER,
    "libelle" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "dateDepense" TIMESTAMP(3) NOT NULL,
    "fournisseur" TEXT,
    "referencePiece" TEXT,
    "commentaire" TEXT,
    "statut" "StatutBudgetDepense" NOT NULL DEFAULT 'en_attente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_depenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "presences_date_idx" ON "presences"("date");

-- CreateIndex
CREATE INDEX "presences_employeId_date_idx" ON "presences"("employeId", "date");

-- CreateIndex
CREATE INDEX "absences_employeId_idx" ON "absences"("employeId");

-- CreateIndex
CREATE INDEX "paie_annee_mois_idx" ON "paie"("annee", "mois");

-- CreateIndex
CREATE INDEX "paie_employeId_idx" ON "paie"("employeId");

-- CreateIndex
CREATE UNIQUE INDEX "paie_employeId_mois_annee_key" ON "paie"("employeId", "mois", "annee");

-- CreateIndex
CREATE INDEX "activite_log_createdAt_idx" ON "activite_log"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "budget_categories_code_key" ON "budget_categories"("code");

-- CreateIndex
CREATE INDEX "budget_enveloppes_annee_idx" ON "budget_enveloppes"("annee");

-- CreateIndex
CREATE INDEX "budget_depenses_enveloppeId_idx" ON "budget_depenses"("enveloppeId");

-- CreateIndex
CREATE INDEX "budget_depenses_dateDepense_idx" ON "budget_depenses"("dateDepense");

-- AddForeignKey
ALTER TABLE "presences" ADD CONSTRAINT "presences_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paie" ADD CONSTRAINT "paie_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidatures" ADD CONSTRAINT "candidatures_offreId_fkey" FOREIGN KEY ("offreId") REFERENCES "offres_emploi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competences" ADD CONSTRAINT "competences_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formations" ADD CONSTRAINT "formations_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluations" ADD CONSTRAINT "evaluations_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activite_log" ADD CONSTRAINT "activite_log_employeId_fkey" FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_enveloppeId_fkey" FOREIGN KEY ("enveloppeId") REFERENCES "budget_enveloppes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "budget_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
