-- Enums de la gestion financière et du moteur de paie v2.
-- Migration isolée : PostgreSQL interdit d'utiliser une valeur ajoutée par ADD VALUE
-- dans la même transaction (les migrations suivantes s'en servent).

-- 1. Statuts de dépense : reprise des anciennes valeurs (données conservées)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'StatutBudgetDepense' AND e.enumlabel = 'en_attente') THEN
    ALTER TYPE "StatutBudgetDepense" RENAME VALUE 'en_attente' TO 'soumise';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'StatutBudgetDepense' AND e.enumlabel = 'approuve') THEN
    ALTER TYPE "StatutBudgetDepense" RENAME VALUE 'approuve' TO 'validee';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'StatutBudgetDepense' AND e.enumlabel = 'refuse') THEN
    ALTER TYPE "StatutBudgetDepense" RENAME VALUE 'refuse' TO 'refusee';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
             WHERE t.typname = 'StatutBudgetDepense' AND e.enumlabel = 'paye') THEN
    ALTER TYPE "StatutBudgetDepense" RENAME VALUE 'paye' TO 'payee';
  END IF;
END $$;

ALTER TYPE "StatutBudgetDepense" ADD VALUE IF NOT EXISTS 'brouillon';
ALTER TYPE "StatutBudgetDepense" ADD VALUE IF NOT EXISTS 'validee_n1';
ALTER TYPE "StatutBudgetDepense" ADD VALUE IF NOT EXISTS 'annulee';

-- 2. Statuts de bulletin v2 (en_attente / paye / annule conservés pour le moteur legacy)
ALTER TYPE "StatutPaie" ADD VALUE IF NOT EXISTS 'brouillon';
ALTER TYPE "StatutPaie" ADD VALUE IF NOT EXISTS 'calcule';
ALTER TYPE "StatutPaie" ADD VALUE IF NOT EXISTS 'valide';

-- 3. Nouveaux enums
DO $$ BEGIN
  CREATE TYPE "ModePaiement" AS ENUM ('especes', 'virement', 'cheque', 'mobile_money', 'carte');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TypeBulletin" AS ENUM ('normal', 'rappel', 'contre_bulletin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "MoteurPaie" AS ENUM ('legacy', 'v2');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TypeRubrique" AS ENUM ('gain', 'retenue', 'cotisation', 'impot', 'info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ModeCalculRubrique" AS ENUM ('fixe', 'base_x_taux', 'bareme', 'variable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "StatutPeriodePaie" AS ENUM ('ouverte', 'calculee', 'validee', 'payee', 'cloturee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "SourceVariablePaie" AS ENUM ('manuel', 'presence', 'absence');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
