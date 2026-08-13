-- ============================================================
-- Migration 014 — Prévision ingrédient + suggestions d'achat
-- Ferme la boucle Prophet (ml_forecasts, CA global) -> besoin
-- ingrédient (via recipe_ingredients) -> suggestion de commande
-- (via ingredients.current_stock/min_stock + purchase_orders en cours).
-- Convention : restaurant_id -> users(id), identique aux migrations précédentes.
-- ============================================================

BEGIN;

-- ---------- Paramètres de réappro par ingrédient (extension, pas de table séparée) ----------
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS auto_suggest_enabled BOOLEAN NOT NULL DEFAULT true;

-- ---------- Prévisions de besoin par ingrédient (décomposition de ml_forecasts) ----------
CREATE TABLE IF NOT EXISTS ingredient_forecasts (
  id                 SERIAL PRIMARY KEY,
  restaurant_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id      INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  forecast_date      DATE NOT NULL,
  quantity_predicted NUMERIC(12,3) NOT NULL CHECK (quantity_predicted >= 0),
  unit               VARCHAR(20) NOT NULL,
  method             VARCHAR(20) NOT NULL DEFAULT 'ratio_v1',  -- 'ratio_v1' = décomposition historique, réservé 'prophet_v2' pour V2
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, ingredient_id, forecast_date, method)
);

CREATE INDEX IF NOT EXISTS idx_ingredient_forecasts_lookup
  ON ingredient_forecasts (restaurant_id, forecast_date);

-- ---------- Suggestions de commande générées automatiquement ----------
CREATE TABLE IF NOT EXISTS purchase_suggestions (
  id                 SERIAL PRIMARY KEY,
  restaurant_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id      INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  suggested_quantity NUMERIC(12,3) NOT NULL,
  unit               VARCHAR(20) NOT NULL,
  supplier_id        INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  calculation_basis  JSONB,     -- snapshot des 4 termes de la formule, pour traçabilité
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','validated','rejected','expired')),
  purchase_order_id  INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,  -- rempli à la validation
  generated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by        INTEGER REFERENCES users(id),
  reviewed_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_purchase_suggestions_pending
  ON purchase_suggestions (restaurant_id, status) WHERE status = 'pending';

-- ---------- Module access : ajouter le module 'purchases' pour ces routes ----------
-- Rien à faire ici : 'purchases' existe déjà dans module_access (utilisé par
-- restaurant-stock-routes.js) — les nouvelles routes se greffent dessus.

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS purchase_suggestions CASCADE;
-- DROP TABLE IF EXISTS ingredient_forecasts CASCADE;
-- ALTER TABLE ingredients DROP COLUMN IF EXISTS auto_suggest_enabled;
-- ALTER TABLE ingredients DROP COLUMN IF EXISTS lead_time_days;
-- COMMIT;
