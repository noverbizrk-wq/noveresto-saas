-- ============================================================
-- Migration 022 — Fiche client detaillee + desactivation restaurant
--
-- customers.notes : notes libres du staff sur un client fidelite.
--
-- users.is_active / deactivated_at : desactivation ("desinscription")
-- d'un compte restaurant. PAS de suppression physique — verifie que ~30
-- tables referencent users(id) avec un comportement ON DELETE mixte
-- (CASCADE et NO ACTION melanges selon la table/colonne), un DELETE
-- direct echouerait ou casserait des donnees de facon imprevisible.
-- La desactivation est reversible et sans risque : le compte devient
-- injoignable (login bloque) sans toucher a aucune ligne existante.
-- ============================================================

BEGIN;

ALTER TABLE customers ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS deactivated_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS is_active;
-- ALTER TABLE customers DROP COLUMN IF EXISTS notes;
-- COMMIT;
