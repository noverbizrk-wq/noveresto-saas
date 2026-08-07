-- ============================================================
-- Migration 008 — Module "Gestion du restaurant" — Lot 9 (complément)
-- Enrichissement des prospects : champs structurés + historique
-- d'interactions horodatées (alimente le stepper visuel du pipeline).
-- ============================================================

BEGIN;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS contact_name VARCHAR(200);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS next_action_date DATE;

CREATE TABLE IF NOT EXISTS prospect_interactions (
  id              SERIAL PRIMARY KEY,
  prospect_id     INTEGER NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  restaurant_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Dénormalisé volontairement pour permettre un scope IDOR direct sur
  -- cette table sans jointure, cohérent avec le reste du code.
  note            TEXT NOT NULL,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_interactions_prospect ON prospect_interactions (prospect_id, created_at);
CREATE INDEX IF NOT EXISTS idx_prospect_interactions_restaurant ON prospect_interactions (restaurant_id);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS prospect_interactions CASCADE;
-- ALTER TABLE prospects DROP COLUMN IF EXISTS contact_name;
-- ALTER TABLE prospects DROP COLUMN IF EXISTS next_action_date;
-- COMMIT;
