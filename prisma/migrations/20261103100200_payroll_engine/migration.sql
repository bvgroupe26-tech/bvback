-- Moteur de paie v2 : rubriques, paramètres datés, barèmes, périodes, variables,
-- lignes de bulletin, mentions employeur. Ajouts uniquement : le moteur legacy
-- (champs Float de "paie", defTaux* de "employes") reste fonctionnel.

-- 1. Employé : mentions bulletin et paiement
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "numeroCnss" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "niu" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "categorie" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "echelon" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "modePaiement" "ModePaiement";
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "banque" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "rib" TEXT;
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "mobileMoney" TEXT;

-- 2. Mentions employeur (ligne unique, à compléter dans l'application)
CREATE TABLE IF NOT EXISTS "employeur_settings" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "raisonSociale" TEXT,
  "adresse" TEXT,
  "ville" TEXT,
  "telephone" TEXT,
  "email" TEXT,
  "niu" TEXT,
  "rccm" TEXT,
  "numeroCnssEmployeur" TEXT,
  "logoUrl" TEXT,
  "conventionCollective" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employeur_settings_pkey" PRIMARY KEY ("id")
);
INSERT INTO "employeur_settings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP)
  ON CONFLICT ("id") DO NOTHING;

-- 3. Rubriques et paramètres
CREATE TABLE IF NOT EXISTS "pay_rules" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "type" "TypeRubrique" NOT NULL,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "imposable" BOOLEAN NOT NULL DEFAULT false,
  "soumisCnss" BOOLEAN NOT NULL DEFAULT false,
  "mode" "ModeCalculRubrique" NOT NULL,
  "baseCode" TEXT,
  "tauxSalarialCode" TEXT,
  "tauxPatronalCode" TEXT,
  "plafondCode" TEXT,
  "baremeCode" TEXT,
  "actif" BOOLEAN NOT NULL DEFAULT true,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pay_rules_code_key" ON "pay_rules"("code");
CREATE INDEX IF NOT EXISTS "pay_rules_ordre_idx" ON "pay_rules"("ordre");

CREATE TABLE IF NOT EXISTS "pay_parameters" (
  "id" SERIAL NOT NULL,
  "code" TEXT NOT NULL,
  "valeur" DECIMAL(14,4) NOT NULL,
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3),
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pay_parameters_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pay_parameters_code_dateDebut_key" ON "pay_parameters"("code", "dateDebut");
CREATE INDEX IF NOT EXISTS "pay_parameters_code_idx" ON "pay_parameters"("code");

CREATE TABLE IF NOT EXISTS "tax_brackets" (
  "id" SERIAL NOT NULL,
  "bareme" TEXT NOT NULL,
  "borneMin" DECIMAL(14,2) NOT NULL,
  "borneMax" DECIMAL(14,2),
  "taux" DECIMAL(7,4) NOT NULL,
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tax_brackets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "tax_brackets_bareme_dateDebut_idx" ON "tax_brackets"("bareme", "dateDebut");

CREATE TABLE IF NOT EXISTS "employee_rubriques" (
  "id" SERIAL NOT NULL,
  "employeId" INTEGER NOT NULL,
  "payRuleId" INTEGER NOT NULL,
  "montant" DECIMAL(14,2),
  "taux" DECIMAL(7,4),
  "dateDebut" TIMESTAMP(3) NOT NULL,
  "dateFin" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_rubriques_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "employee_rubriques_employeId_idx" ON "employee_rubriques"("employeId");

-- 4. Périodes et variables
CREATE TABLE IF NOT EXISTS "payroll_periods" (
  "id" SERIAL NOT NULL,
  "annee" INTEGER NOT NULL,
  "mois" INTEGER NOT NULL,
  "statut" "StatutPeriodePaie" NOT NULL DEFAULT 'ouverte',
  "clotureAt" TIMESTAMP(3),
  "clotureById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_periods_annee_mois_key" ON "payroll_periods"("annee", "mois");

CREATE TABLE IF NOT EXISTS "payroll_variables" (
  "id" SERIAL NOT NULL,
  "periodId" INTEGER NOT NULL,
  "employeId" INTEGER NOT NULL,
  "payRuleId" INTEGER NOT NULL,
  "quantite" DECIMAL(10,2),
  "montant" DECIMAL(14,2),
  "source" "SourceVariablePaie" NOT NULL DEFAULT 'manuel',
  "commentaire" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_variables_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payroll_variables_periodId_employeId_idx" ON "payroll_variables"("periodId", "employeId");

-- 5. Bulletin : colonnes v2
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "periodId" INTEGER;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "numero" TEXT;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "type" "TypeBulletin" NOT NULL DEFAULT 'normal';
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "annuleBulletinId" INTEGER;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "brut" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "brutImposable" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "netImposable" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "totalCotisSal" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "totalCotisPat" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "netAPayer" DECIMAL(14,2);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "employeSnapshot" JSONB;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "employeurSnapshot" JSONB;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "cumuls" JSONB;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "hashSha256" TEXT;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "validatedAt" TIMESTAMP(3);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "validatedById" INTEGER;
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "moteur" "MoteurPaie" NOT NULL DEFAULT 'legacy';
CREATE UNIQUE INDEX IF NOT EXISTS "paie_numero_key" ON "paie"("numero");
CREATE INDEX IF NOT EXISTS "paie_periodId_idx" ON "paie"("periodId");

-- Unicité de période limitée aux bulletins "normal" : rappels et contre-bulletins
-- doivent pouvoir coexister avec le bulletin d'origine.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "paie"
    WHERE "deletedAt" IS NULL AND "statut" <> 'annule'::"StatutPaie" AND "type" = 'normal'::"TypeBulletin"
    GROUP BY "employeId", lpad("mois", 2, '0'), "annee" HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'payroll_engine: doublons de paie, index paie_employe_periode_active_key inchangé';
  ELSE
    DROP INDEX IF EXISTS "paie_employe_periode_active_key";
    CREATE UNIQUE INDEX "paie_employe_periode_active_key"
      ON "paie" ("employeId", lpad("mois", 2, '0'), "annee")
      WHERE "deletedAt" IS NULL AND "statut" <> 'annule'::"StatutPaie" AND "type" = 'normal'::"TypeBulletin";
  END IF;
END $$;

-- 6. Lignes de bulletin
CREATE TABLE IF NOT EXISTS "payslip_lines" (
  "id" SERIAL NOT NULL,
  "paieId" INTEGER NOT NULL,
  "payRuleId" INTEGER,
  "code" TEXT NOT NULL,
  "libelle" TEXT NOT NULL,
  "ordre" INTEGER NOT NULL DEFAULT 0,
  "type" "TypeRubrique" NOT NULL,
  "base" DECIMAL(14,2),
  "taux" DECIMAL(7,4),
  "quantite" DECIMAL(10,2),
  "montantSalarial" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "montantPatronal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "imposable" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "payslip_lines_paieId_idx" ON "payslip_lines"("paieId");

-- 7. Clés étrangères
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paie_periodId_fkey') THEN
    ALTER TABLE "paie" ADD CONSTRAINT "paie_periodId_fkey"
      FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'paie_annuleBulletinId_fkey') THEN
    ALTER TABLE "paie" ADD CONSTRAINT "paie_annuleBulletinId_fkey"
      FOREIGN KEY ("annuleBulletinId") REFERENCES "paie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_rubriques_employeId_fkey') THEN
    ALTER TABLE "employee_rubriques" ADD CONSTRAINT "employee_rubriques_employeId_fkey"
      FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employee_rubriques_payRuleId_fkey') THEN
    ALTER TABLE "employee_rubriques" ADD CONSTRAINT "employee_rubriques_payRuleId_fkey"
      FOREIGN KEY ("payRuleId") REFERENCES "pay_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_variables_periodId_fkey') THEN
    ALTER TABLE "payroll_variables" ADD CONSTRAINT "payroll_variables_periodId_fkey"
      FOREIGN KEY ("periodId") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_variables_employeId_fkey') THEN
    ALTER TABLE "payroll_variables" ADD CONSTRAINT "payroll_variables_employeId_fkey"
      FOREIGN KEY ("employeId") REFERENCES "employes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payroll_variables_payRuleId_fkey') THEN
    ALTER TABLE "payroll_variables" ADD CONSTRAINT "payroll_variables_payRuleId_fkey"
      FOREIGN KEY ("payRuleId") REFERENCES "pay_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslip_lines_paieId_fkey') THEN
    ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_paieId_fkey"
      FOREIGN KEY ("paieId") REFERENCES "paie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payslip_lines_payRuleId_fkey') THEN
    ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payRuleId_fkey"
      FOREIGN KEY ("payRuleId") REFERENCES "pay_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
