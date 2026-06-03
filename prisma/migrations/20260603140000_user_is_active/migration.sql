-- Activation / désactivation des comptes utilisateurs (sans archivage)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
