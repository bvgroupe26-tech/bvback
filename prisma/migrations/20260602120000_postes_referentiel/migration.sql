CREATE TABLE "postes_referentiel" (
    "id" SERIAL NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postes_referentiel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "postes_referentiel_label_key" ON "postes_referentiel"("label");

INSERT INTO "postes_referentiel" ("label")
SELECT DISTINCT TRIM("poste")
FROM "employes"
WHERE "poste" IS NOT NULL
  AND TRIM("poste") <> ''
  AND "deletedAt" IS NULL
ON CONFLICT ("label") DO NOTHING;
