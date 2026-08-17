-- ============================================================
-- Migration 019 — Fidelisation, Phase A (fondation)
--
-- Aucune notion de client final n'existait jusqu'ici (confirme : pas de
-- table customers, pas de telephone/email sur orders). La page Fidelisation
-- affichait des chiffres 100% fictifs (847 clients, niveaux VIP, taux de
-- retour) sans aucune donnee reelle derriere.
--
-- Design : les points sont un GRAND-LIVRE (ledger), pas un solde mutable
-- direct — meme principe que stock_movements/inventory_counts deja en
-- place. Le solde = SUM(points_delta), toujours recalculable, traçable,
-- jamais desynchronise.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS customers (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone         VARCHAR(30) NOT NULL,
  name          VARCHAR(200),
  birthday      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_customers_restaurant ON customers (restaurant_id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);

CREATE TABLE IF NOT EXISTS loyalty_points_ledger (
  id             SERIAL PRIMARY KEY,
  customer_id    INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  restaurant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_delta   INTEGER NOT NULL,
  reason         VARCHAR(50) NOT NULL, -- 'order_completed' | 'manual_adjustment' | 'promo_bonus'
  reference_type VARCHAR(30),
  reference_id   INTEGER,
  note           TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_customer ON loyalty_points_ledger (customer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_restaurant ON loyalty_points_ledger (restaurant_id);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS loyalty_points_ledger CASCADE;
-- ALTER TABLE orders DROP COLUMN IF EXISTS customer_id;
-- DROP TABLE IF EXISTS customers CASCADE;
-- COMMIT;
