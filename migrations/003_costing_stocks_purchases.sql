-- ============================================================
-- Migration 003 — Module "Gestion du restaurant" — Lot 2
-- Recettes, coûts, marges, stocks, achats
-- Convention : restaurant_id -> users(id), identique au Lot 1.
-- S'appuie sur `suppliers` (créée vide en Lot 1) et `menu_items`.
-- ============================================================

BEGIN;

-- ---------- Ingrédients (matières premières) ----------
CREATE TABLE IF NOT EXISTS ingredients (
  id             SERIAL PRIMARY KEY,
  restaurant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  name           VARCHAR(200) NOT NULL,
  unit           VARCHAR(20) NOT NULL DEFAULT 'kg',   -- kg, g, l, ml, unite
  current_stock  NUMERIC(12,3) NOT NULL DEFAULT 0,
  min_stock      NUMERIC(12,3) NOT NULL DEFAULT 0,     -- seuil d'alerte
  unit_cost      NUMERIC(10,3) NOT NULL DEFAULT 0,     -- dernier prix d'achat connu
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Fiches techniques (recette = liste d'ingrédients par article de menu) ----------
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id             SERIAL PRIMARY KEY,
  menu_item_id   INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id  INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity       NUMERIC(10,3) NOT NULL,   -- dans l'unité de l'ingrédient (MVP : pas de conversion d'unité)
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (menu_item_id, ingredient_id)
);

-- ---------- Mouvements de stock (traçabilité complète) ----------
CREATE TABLE IF NOT EXISTS stock_movements (
  id              SERIAL PRIMARY KEY,
  restaurant_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ingredient_id   INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  movement_type   VARCHAR(30) NOT NULL,   -- purchase_receipt, consumption, loss, correction, initial
  quantity        NUMERIC(12,3) NOT NULL, -- signé : positif = entrée, négatif = sortie
  reference_type  VARCHAR(30),            -- 'order', 'purchase_order', 'manual'
  reference_id    INTEGER,
  note            TEXT,
  created_by      INTEGER REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Achats fournisseurs ----------
CREATE TABLE IF NOT EXISTS purchase_orders (
  id             SERIAL PRIMARY KEY,
  restaurant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'draft',  -- draft, sent, received, cancelled
  ordered_at     TIMESTAMPTZ,
  received_at    TIMESTAMPTZ,
  total_amount   NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id                 SERIAL PRIMARY KEY,
  purchase_order_id  INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id      INTEGER NOT NULL REFERENCES ingredients(id),
  quantity           NUMERIC(12,3) NOT NULL,
  unit_price         NUMERIC(10,3) NOT NULL
);

-- ---------- Index ----------
CREATE INDEX IF NOT EXISTS idx_ingredients_restaurant ON ingredients (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_menu_item ON recipe_ingredients (menu_item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements (ingredient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_restaurant ON stock_movements (restaurant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_restaurant ON purchase_orders (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po ON purchase_order_items (purchase_order_id);

-- ---------- Trigger updated_at (réutilise la fonction créée en Lot 1) ----------
DROP TRIGGER IF EXISTS trg_ingredients_updated_at ON ingredients;
CREATE TRIGGER trg_ingredients_updated_at BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS purchase_order_items CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;
-- DROP TABLE IF EXISTS stock_movements CASCADE;
-- DROP TABLE IF EXISTS recipe_ingredients CASCADE;
-- DROP TABLE IF EXISTS ingredients CASCADE;
-- COMMIT;
