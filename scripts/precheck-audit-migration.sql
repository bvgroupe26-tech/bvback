-- Pré-vérification avant la migration 20261102120000_audit_security.
-- Lecture seule. Chaque requête doit renvoyer 0 ligne ; sinon corriger les doublons
-- (archiver le compte / la fiche / le pointage / le bulletin en trop) avant de déployer.

-- 1. Comptes actifs partageant le même email (casse ignorée)
SELECT lower(trim("email")) AS email, count(*) AS nb, array_agg("id" ORDER BY "id") AS user_ids,
       array_agg("role"::text ORDER BY "id") AS roles
FROM "users"
WHERE "deletedAt" IS NULL
GROUP BY lower(trim("email"))
HAVING count(*) > 1;

-- 2. Fiches employé actives partageant le même email
SELECT lower(trim("email")) AS email, count(*) AS nb, array_agg("id" ORDER BY "id") AS employe_ids
FROM "employes"
WHERE "deletedAt" IS NULL AND "email" IS NOT NULL
GROUP BY lower(trim("email"))
HAVING count(*) > 1;

-- 3. Comptes actifs sans fiche correspondante (info : ne bloque pas la migration)
SELECT u."id", u."email", u."role"
FROM "users" u
WHERE u."deletedAt" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "employes" e
    WHERE e."deletedAt" IS NULL AND lower(trim(e."email")) = lower(trim(u."email"))
  );

-- 4. Plusieurs pointages actifs pour un même employé et un même jour
SELECT "employeId", "date", count(*) AS nb, array_agg("id" ORDER BY "id") AS presence_ids
FROM "presences"
WHERE "deletedAt" IS NULL
GROUP BY "employeId", "date"
HAVING count(*) > 1;

-- 5. Plusieurs bulletins non annulés pour un même employé et une même période ("3" = "03")
SELECT "employeId", lpad("mois", 2, '0') AS mois, "annee", count(*) AS nb,
       array_agg("id" ORDER BY "id") AS paie_ids, array_agg("statut"::text ORDER BY "id") AS statuts
FROM "paie"
WHERE "deletedAt" IS NULL AND "statut" <> 'annule'
GROUP BY "employeId", lpad("mois", 2, '0'), "annee"
HAVING count(*) > 1;

-- 6. Mois de paie non conformes (attendu : "01" à "12")
SELECT "id", "employeId", "mois", "annee"
FROM "paie"
WHERE "deletedAt" IS NULL AND "mois" !~ '^(0?[1-9]|1[0-2])$';
