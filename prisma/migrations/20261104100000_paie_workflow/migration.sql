-- Workflow de paie v2 : rappels et contre-bulletins coexistent avec le bulletin d'origine.
-- L'index hérité (employeId, mois, annee) WHERE deletedAt IS NULL l'interdit ; il n'est supprimé
-- que si son remplacement "paie_employe_periode_active_key" (bulletins normaux non annulés) existe,
-- pour ne jamais laisser la table sans garantie d'unicité. Idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'paie_employe_periode_active_key') THEN
    DROP INDEX IF EXISTS "paie_employeId_mois_annee_active_key";
  ELSE
    RAISE WARNING 'paie_workflow: index paie_employe_periode_active_key absent, index hérité conservé (rappels / contre-bulletins bloqués)';
  END IF;
END $$;
