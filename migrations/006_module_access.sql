-- ============================================================
-- Migration 006 — Module "Gestion du restaurant" — Lot 7
-- Permissions par module (RBAC granulaire par compte client)
--
-- Modèle : une ligne = un module ACTIVÉ pour un compte. Absence de ligne
-- = pas d'accès à ce module. Rétrocompatibilité : backfill immédiat de
-- tous les modules pour tous les comptes non-admin existants, pour ne
-- rien casser — l'admin pourra ensuite restreindre au cas par cas.
--
-- Les comptes admin (role='admin') ne sont jamais soumis à cette
-- vérification (accès total, cf. middleware).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS module_access (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key    VARCHAR(50) NOT NULL,
  granted_by    INTEGER REFERENCES users(id),
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

CREATE INDEX IF NOT EXISTS idx_module_access_user ON module_access (user_id);

-- Backfill : tous les comptes non-admin existants reçoivent tous les
-- modules actuels du cahier des charges (Lots 1-5). Liste des clés
-- alignée avec la nav frontend (app/dashboard/layout.tsx).
DO $$
DECLARE
  v_user_id INTEGER;
  v_modules TEXT[] := ARRAY['overview','orders','kds','menus','recipes','stocks','purchases','staff','disputes','finance','copilot'];
  v_module TEXT;
BEGIN
  FOR v_user_id IN SELECT id FROM users WHERE role != 'admin' LOOP
    FOREACH v_module IN ARRAY v_modules LOOP
      INSERT INTO module_access (user_id, module_key)
      VALUES (v_user_id, v_module)
      ON CONFLICT (user_id, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- DROP TABLE IF EXISTS module_access CASCADE;
