-- Ajout d'un matricule RH lisible et unique.
ALTER TABLE "employes"
ADD COLUMN "matricule" TEXT;

-- Backfill des lignes existantes.
UPDATE "employes"
SET "matricule" = 'EMP-' || LPAD("id"::text, 6, '0')
WHERE "matricule" IS NULL;

CREATE UNIQUE INDEX "employes_matricule_key" ON "employes"("matricule");
