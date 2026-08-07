-- ============================================================
-- Migration 007 — Module "Gestion du restaurant" — Lot 9
-- Prospection commerciale (recherche de commerces via Google Places)
--
-- Convention : restaurant_id -> users(id), identique aux lots précédents.
-- Intègre le système de permissions du Lot 7 : ajoute 'prospection' aux
-- modules disponibles, avec backfill pour les comptes existants.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS prospects (
  id                SERIAL PRIMARY KEY,
  restaurant_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_place_id   VARCHAR(200) NOT NULL,
  name              VARCHAR(300) NOT NULL,
  address           TEXT,
  phone             VARCHAR(50),
  website           TEXT,
  rating            NUMERIC(2,1),
  review_count      INTEGER DEFAULT 0,
  latitude          NUMERIC(10,7),
  longitude         NUMERIC(10,7),
  category          VARCHAR(100),
  zone_label        VARCHAR(200),
  opportunity_tier  VARCHAR(20) NOT NULL DEFAULT 'invisible',
  -- 'invisible' | 'presence_faible' | 'etabli'
  status            VARCHAR(20) NOT NULL DEFAULT 'nouveau',
  -- 'nouveau' | 'contacte' | 'qualifie' | 'rejete'
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, google_place_id)
);

CREATE INDEX IF NOT EXISTS idx_prospects_restaurant ON prospects (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_prospects_tier ON prospects (restaurant_id, opportunity_tier);

DROP TRIGGER IF EXISTS trg_prospects_updated_at ON prospects;
CREATE TRIGGER trg_prospects_updated_at BEFORE UPDATE ON prospects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Backfill du nouveau module 'prospection' pour tous les comptes existants
-- (cohérent avec le système de permissions du Lot 7 — pas de régression)
INSERT INTO module_access (user_id, module_key)
SELECT id, 'prospection' FROM users WHERE role != 'admin'
ON CONFLICT (user_id, module_key) DO NOTHING;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DELETE FROM module_access WHERE module_key = 'prospection';
-- DROP TABLE IF EXISTS prospects CASCADE;
-- COMMIT;
