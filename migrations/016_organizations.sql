-- ============================================================
-- Migration 016 — Multi-sites (franchises)
--
-- Modele : une organisation regroupe plusieurs comptes-restaurants.
-- Aucune table metier n'est modifiee : toutes restent en
-- restaurant_id -> users(id). Un compte 'franchise_owner' ne porte
-- aucune donnee metier, il ne fait que designer un restaurant de son
-- organisation (meme mecanisme que 'admin', restreint a un perimetre).
--
-- users.role est un VARCHAR(50) sans contrainte enum : le nouveau role
-- 'franchise_owner' ne necessite aucune migration de type.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS organizations (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id INTEGER
  REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_organization ON users (organization_id);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS organization_id;
-- DROP TABLE IF EXISTS organizations CASCADE;
-- COMMIT;
