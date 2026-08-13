-- ============================================================
-- Migration 015 — Ecart de consommation (theorique vs reel)
-- Chaque comptage physique capture le stock theorique au moment T
-- (snapshot de ingredients.current_stock), la quantite reellement
-- comptee, et l'ecart en quantite et en valeur (via unit_cost).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS inventory_counts (
  id                   SERIAL PRIMARY KEY,
  restaurant_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id        INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  theoretical_quantity NUMERIC(12,3) NOT NULL,
  counted_quantity     NUMERIC(12,3) NOT NULL,
  variance             NUMERIC(12,3) NOT NULL,
  variance_value       NUMERIC(12,3),
  unit                 VARCHAR(20) NOT NULL,
  note                 TEXT,
  counted_by           INTEGER REFERENCES users(id),
  counted_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_counts_restaurant_date
  ON inventory_counts (restaurant_id, counted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_counts_ingredient
  ON inventory_counts (ingredient_id);

COMMIT;
