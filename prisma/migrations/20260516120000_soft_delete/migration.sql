-- Soft delete : colonne deletedAt sur toutes les tables métier

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "presences" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "absences" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "paie" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "offres_emploi" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "candidatures" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "competences" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "formations" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "evaluations" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "activite_log" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "budget_categories" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "budget_enveloppes" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "budget_depenses" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Paie : un bulletin actif unique par employé / mois / année (les lignes supprimées logiquement sont exclues)
DROP INDEX IF EXISTS "paie_employeId_mois_annee_key";
CREATE INDEX "paie_employeId_mois_annee_idx" ON "paie"("employeId", "mois", "annee");
CREATE UNIQUE INDEX "paie_employeId_mois_annee_active_key" ON "paie"("employeId", "mois", "annee") WHERE "deletedAt" IS NULL;

-- Email utilisateur unique parmi les comptes actifs
DROP INDEX IF EXISTS "users_email_key";
CREATE UNIQUE INDEX "users_email_active_key" ON "users"("email") WHERE "deletedAt" IS NULL;

-- Code catégorie budget unique parmi les catégories actives
DROP INDEX IF EXISTS "budget_categories_code_key";
CREATE UNIQUE INDEX "budget_categories_code_active_key" ON "budget_categories"("code") WHERE "deletedAt" IS NULL;
