-- Gestion financière P1 : montants Decimal HT/TVA/TTC, workflow, fournisseurs,
-- pièces jointes, historique, paramètres. Idempotente (appliquée au démarrage Render).

-- 1. Enveloppes
ALTER TABLE "budget_enveloppes"
  ALTER COLUMN "montantPrevu" SET DATA TYPE DECIMAL(14,2) USING round("montantPrevu"::numeric, 2);
ALTER TABLE "budget_enveloppes" ADD COLUMN IF NOT EXISTS "seuilAlertePct" INTEGER NOT NULL DEFAULT 80;
ALTER TABLE "budget_enveloppes" ADD COLUMN IF NOT EXISTS "bloquerDepassement" BOOLEAN NOT NULL DEFAULT false;

-- 2. Catégories
ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "compteSyscohada" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "budget_categories" WHERE "deletedAt" IS NULL
    GROUP BY lower("code") HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'finance_p1: codes de catégorie en double, index budget_categories_code_active_key non créé';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "budget_categories_code_active_key"
      ON "budget_categories" (lower("code")) WHERE "deletedAt" IS NULL;
  END IF;
END $$;

-- 3. Fournisseurs
CREATE TABLE IF NOT EXISTS "fournisseurs" (
  "id" SERIAL NOT NULL,
  "nom" TEXT NOT NULL,
  "niu" TEXT,
  "rccm" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "adresse" TEXT,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "fournisseurs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "fournisseurs_nom_idx" ON "fournisseurs"("nom");

-- 4. Dépenses : montant (Float) → montantHt / montantTva / montantTtc (Decimal)
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "montantHt" DECIMAL(14,2);
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "tauxTva" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "montantTva" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "montantTtc" DECIMAL(14,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'budget_depenses' AND column_name = 'montant'
  ) THEN
    EXECUTE 'UPDATE "budget_depenses"
             SET "montantTtc" = round("montant"::numeric, 2),
                 "montantHt"  = round("montant"::numeric, 2)
             WHERE "montantTtc" IS NULL';
  END IF;
END $$;

UPDATE "budget_depenses" SET "montantTtc" = 0 WHERE "montantTtc" IS NULL;
UPDATE "budget_depenses" SET "montantHt" = "montantTtc" - "montantTva" WHERE "montantHt" IS NULL;
ALTER TABLE "budget_depenses" ALTER COLUMN "montantTtc" SET NOT NULL;
ALTER TABLE "budget_depenses" ALTER COLUMN "montantHt" SET NOT NULL;
ALTER TABLE "budget_depenses" DROP COLUMN IF EXISTS "montant";

ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "fournisseurId" INTEGER;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "modePaiement" "ModePaiement";
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "referencePaiement" TEXT;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "datePaiement" TIMESTAMP(3);
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "demandeurId" INTEGER;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "valideurN1Id" INTEGER;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "valideurId" INTEGER;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "payeurId" INTEGER;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "valideLe" TIMESTAMP(3);
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "motifRefus" TEXT;
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "budget_depenses" ALTER COLUMN "statut" SET DEFAULT 'brouillon';

-- Une dépense déjà payée garde sa date de paiement approximative
UPDATE "budget_depenses" SET "datePaiement" = "dateDepense"
  WHERE "statut" = 'payee' AND "datePaiement" IS NULL;

CREATE INDEX IF NOT EXISTS "budget_depenses_statut_idx" ON "budget_depenses"("statut");
CREATE INDEX IF NOT EXISTS "budget_depenses_fournisseurId_idx" ON "budget_depenses"("fournisseurId");

-- Suppression d'une enveloppe : plus de cascade sur les dépenses
ALTER TABLE "budget_depenses" DROP CONSTRAINT IF EXISTS "budget_depenses_enveloppeId_fkey";
ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_enveloppeId_fkey"
  FOREIGN KEY ("enveloppeId") REFERENCES "budget_enveloppes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depenses_fournisseurId_fkey') THEN
    ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_fournisseurId_fkey"
      FOREIGN KEY ("fournisseurId") REFERENCES "fournisseurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depenses_demandeurId_fkey') THEN
    ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_demandeurId_fkey"
      FOREIGN KEY ("demandeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depenses_valideurN1Id_fkey') THEN
    ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_valideurN1Id_fkey"
      FOREIGN KEY ("valideurN1Id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depenses_valideurId_fkey') THEN
    ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_valideurId_fkey"
      FOREIGN KEY ("valideurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depenses_payeurId_fkey') THEN
    ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_payeurId_fkey"
      FOREIGN KEY ("payeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. Pièces jointes
CREATE TABLE IF NOT EXISTS "budget_pieces_jointes" (
  "id" SERIAL NOT NULL,
  "depenseId" INTEGER NOT NULL,
  "url" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "mime" TEXT,
  "taille" INTEGER,
  "uploadedById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_pieces_jointes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_pieces_jointes_depenseId_idx" ON "budget_pieces_jointes"("depenseId");

-- 6. Historique des transitions
CREATE TABLE IF NOT EXISTS "budget_depense_historique" (
  "id" SERIAL NOT NULL,
  "depenseId" INTEGER NOT NULL,
  "deStatut" "StatutBudgetDepense",
  "versStatut" "StatutBudgetDepense" NOT NULL,
  "userId" INTEGER,
  "commentaire" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "budget_depense_historique_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "budget_depense_historique_depenseId_idx" ON "budget_depense_historique"("depenseId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_pieces_jointes_depenseId_fkey') THEN
    ALTER TABLE "budget_pieces_jointes" ADD CONSTRAINT "budget_pieces_jointes_depenseId_fkey"
      FOREIGN KEY ("depenseId") REFERENCES "budget_depenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_pieces_jointes_uploadedById_fkey') THEN
    ALTER TABLE "budget_pieces_jointes" ADD CONSTRAINT "budget_pieces_jointes_uploadedById_fkey"
      FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depense_historique_depenseId_fkey') THEN
    ALTER TABLE "budget_depense_historique" ADD CONSTRAINT "budget_depense_historique_depenseId_fkey"
      FOREIGN KEY ("depenseId") REFERENCES "budget_depenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'budget_depense_historique_userId_fkey') THEN
    ALTER TABLE "budget_depense_historique" ADD CONSTRAINT "budget_depense_historique_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 7. Paramètres (ligne unique)
CREATE TABLE IF NOT EXISTS "parametres_finance" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "tauxTvaDefaut" DECIMAL(5,2) NOT NULL DEFAULT 18,
  "seuilJustificatif" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "seuilValidationN2" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "periodeCloseJusquau" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "parametres_finance_pkey" PRIMARY KEY ("id")
);
INSERT INTO "parametres_finance" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
