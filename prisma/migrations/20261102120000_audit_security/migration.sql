-- Audit sécurité : lien explicite User ↔ Employe, emails normalisés, unicités métier.
-- Exécuter d'abord scripts/precheck-audit-migration.sql : les index uniques ci-dessous
-- sont SAUTÉS (WARNING dans les logs) s'il reste des doublons, pour ne pas bloquer
-- `prisma migrate deploy` au démarrage Render. Relancer ensuite le bloc concerné à la main.

-- 1. Colonne de lien
ALTER TABLE "employes" ADD COLUMN IF NOT EXISTS "userId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employes_userId_fkey'
  ) THEN
    ALTER TABLE "employes"
      ADD CONSTRAINT "employes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "employes_userId_key" ON "employes"("userId");

-- 2. Normalisation des emails (trim + minuscules)
-- users_email_active_key (migration soft_delete) est sensible à la casse : on ne normalise
-- pas les comptes qui entreraient en collision, sinon la migration échoue et Render ne démarre plus.
UPDATE "users" u SET "email" = lower(trim(u."email"))
  WHERE u."email" <> lower(trim(u."email"))
    AND NOT EXISTS (
      SELECT 1 FROM "users" u2
      WHERE u2."id" <> u."id" AND lower(trim(u2."email")) = lower(trim(u."email"))
    );
UPDATE "employes" SET "email" = lower(trim("email"))
  WHERE "email" IS NOT NULL AND "email" <> lower(trim("email"));

-- 3. Backfill du lien : un seul compte actif par email, une seule fiche (la plus ancienne) par compte
WITH candidates AS (
  SELECT DISTINCT ON (u."id") u."id" AS user_id, e."id" AS employe_id
  FROM "users" u
  JOIN "employes" e ON e."email" = u."email"
  WHERE u."deletedAt" IS NULL
    AND e."deletedAt" IS NULL
    AND e."userId" IS NULL
    AND (SELECT count(*) FROM "users" u2 WHERE u2."email" = u."email" AND u2."deletedAt" IS NULL) = 1
    AND NOT EXISTS (SELECT 1 FROM "employes" e2 WHERE e2."userId" = u."id")
  ORDER BY u."id", e."id"
)
UPDATE "employes" e
SET "userId" = c.user_id
FROM candidates c
WHERE e."id" = c.employe_id;

-- 4. Unicité email des comptes actifs
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users" WHERE "deletedAt" IS NULL
    GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'audit_security: doublons d''email dans users, index users_email_active_key laissé sensible à la casse';
  ELSE
    DROP INDEX IF EXISTS "users_email_active_key";
    CREATE UNIQUE INDEX "users_email_active_key"
      ON "users" (lower("email")) WHERE "deletedAt" IS NULL;
  END IF;
END $$;

-- 5. Unicité email des fiches actives
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "employes" WHERE "deletedAt" IS NULL AND "email" IS NOT NULL
    GROUP BY lower("email") HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'audit_security: doublons d''email dans employes, index employes_email_active_key non créé';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "employes_email_active_key"
      ON "employes" (lower("email")) WHERE "deletedAt" IS NULL AND "email" IS NOT NULL;
  END IF;
END $$;

-- 6. Un seul pointage par employé et par jour (hors archivés)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "presences" WHERE "deletedAt" IS NULL
    GROUP BY "employeId", "date" HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'audit_security: doublons de presences, index presences_employe_date_active_key non créé';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "presences_employe_date_active_key"
      ON "presences" ("employeId", "date") WHERE "deletedAt" IS NULL;
  END IF;
END $$;

-- 7. Un seul bulletin non annulé par employé et par période ("3" et "03" comptent pour le même mois)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "paie"
    WHERE "deletedAt" IS NULL AND "statut" <> 'annule'::"StatutPaie"
    GROUP BY "employeId", lpad("mois", 2, '0'), "annee" HAVING count(*) > 1
  ) THEN
    RAISE WARNING 'audit_security: doublons de paie, index paie_employe_periode_active_key non créé';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS "paie_employe_periode_active_key"
      ON "paie" ("employeId", lpad("mois", 2, '0'), "annee")
      WHERE "deletedAt" IS NULL AND "statut" <> 'annule'::"StatutPaie";
  END IF;
END $$;
