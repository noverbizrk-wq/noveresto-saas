-- ============================================================
-- Migration 001 (v2) — Module "Gestion du restaurant" — Lot 1 MVP
-- Révisée suite audit AUDIT_RESTAURANT_MODULE.md (2026-08-01)
--
-- Changements vs v1 :
-- - products renommé menu_items (aligne sur vocabulaire Phase 1/2 de l'audit)
-- - ajout table menus (collection nommée, ex. "Menu principal", "Menu midi")
-- - ajout table audit_log générique (cf. audit §1.12/§5.3/§7 Phase 0)
-- - restaurant_id FK vers USERS(id), pas restaurants(id) — cf. découverte
--   lors de la lecture du code réel (server.js, reputation-routes.js:203) :
--   le tenant réellement utilisé partout dans le code existant est
--   `req.user.id`, jamais un restaurants.id distinct. La table `restaurants`
--   existe en base (confirmée par l'audit) mais n'est interrogée nulle part
--   dans le code applicatif actuel. Aligner sur la convention réelle plutôt
--   que sur un schéma théorique inutilisé.
-- - aucune contrainte CHECK sur users.role trouvée par l'audit → pas de
--   migration de contrainte nécessaire pour étendre les rôles plus tard
-- - suppliers ajouté en prévision Phase 2 (structure minimale, vide pour
--   l'instant — pas utilisé par ce Lot 1)
-- ============================================================

BEGIN;

-- ---------- Canaux de vente ----------
CREATE TABLE IF NOT EXISTS sales_channels (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(30) UNIQUE NOT NULL,
  label         VARCHAR(100) NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sales_channels (code, label) VALUES
  ('dine_in', 'Sur place'),
  ('takeaway', 'À emporter'),
  ('delivery_platform', 'Livraison plateforme'),
  ('direct_online', 'Commande directe en ligne'),
  ('phone', 'Téléphone'),
  ('qr_code', 'QR Code table'),
  ('kiosk', 'Borne de commande'),
  ('manual', 'Saisie manuelle')
ON CONFLICT (code) DO NOTHING;

-- ---------- Plateformes de livraison ----------
CREATE TABLE IF NOT EXISTS delivery_platforms (
  id                SERIAL PRIMARY KEY,
  code              VARCHAR(30) UNIQUE NOT NULL,
  label             VARCHAR(100) NOT NULL,
  commission_rate   NUMERIC(5,2) DEFAULT 0,
  connector_status  VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  last_sync_at      TIMESTAMPTZ,
  config            JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO delivery_platforms (code, label, connector_status) VALUES
  ('uber_eats', 'Uber Eats', 'sandbox'),
  ('deliveroo', 'Deliveroo', 'sandbox'),
  ('just_eat', 'Just Eat', 'sandbox'),
  ('none', 'Aucune (vente directe)', 'connected')
ON CONFLICT (code) DO NOTHING;

-- ---------- Fournisseurs (structure minimale, Phase 2 de l'audit) ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id              SERIAL PRIMARY KEY,
  restaurant_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  contact_phone   VARCHAR(30),
  contact_email   VARCHAR(200),
  payment_terms   TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Menus / catégories / articles ----------
CREATE TABLE IF NOT EXISTS menus (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,        -- ex. "Menu principal", "Menu midi"
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  menu_id       INTEGER REFERENCES menus(id) ON DELETE CASCADE,
  name          VARCHAR(150) NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id                SERIAL PRIMARY KEY,
  restaurant_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id       INTEGER REFERENCES menu_categories(id) ON DELETE SET NULL,
  name              VARCHAR(200) NOT NULL,
  description       TEXT,
  price             NUMERIC(10,3) NOT NULL DEFAULT 0,
  vat_rate          NUMERIC(5,2) NOT NULL DEFAULT 19,
  is_available      BOOLEAN NOT NULL DEFAULT true,
  photo_url         TEXT,
  -- Point d'accroche futur costing platform / recipes (Phase 1 audit), nullable :
  recipe_cost_ref   VARCHAR(100),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_item_channel_overrides (
  id            SERIAL PRIMARY KEY,
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  channel_id    INTEGER NOT NULL REFERENCES sales_channels(id),
  price         NUMERIC(10,3),
  is_available  BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (menu_item_id, channel_id)
);

-- ---------- Commandes centralisées ----------
CREATE TABLE IF NOT EXISTS orders (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel_id            INTEGER NOT NULL REFERENCES sales_channels(id),
  delivery_platform_id  INTEGER REFERENCES delivery_platforms(id),
  external_order_ref    VARCHAR(100),
  status                VARCHAR(30) NOT NULL DEFAULT 'new',
  -- new, to_validate, accepted, in_preparation, ready, awaiting_courier,
  -- handed_off, delivered, completed, cancelled, refunded, disputed
  received_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  promised_at           TIMESTAMPTZ,
  gross_amount          NUMERIC(10,3) NOT NULL DEFAULT 0,
  discount_amount       NUMERIC(10,3) NOT NULL DEFAULT 0,
  commission_amount     NUMERIC(10,3) NOT NULL DEFAULT 0,
  net_amount            NUMERIC(10,3) GENERATED ALWAYS AS
                         (gross_amount - discount_amount - commission_amount) STORED,
  payment_method        VARCHAR(30),
  customer_note         TEXT,
  allergen_flags        TEXT,
  courier_status        VARCHAR(30),
  created_by            INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id  INTEGER NOT NULL REFERENCES menu_items(id),
  item_name     VARCHAR(200) NOT NULL,  -- snapshot au moment de la commande
  quantity      INTEGER NOT NULL DEFAULT 1,
  unit_price    NUMERIC(10,3) NOT NULL,
  modifiers     JSONB DEFAULT '[]'::jsonb,
  station       VARCHAR(50),
  is_cancelled  BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS order_status_history (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status   VARCHAR(30),
  to_status     VARCHAR(30) NOT NULL,
  changed_by    INTEGER REFERENCES users(id),
  reason        TEXT,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Audit générique (cf. audit §1.12 / §5.3 / §7 Phase 0) ----------
-- Table neutre, distincte de social_audit_log existante. Décision de fusion
-- éventuelle des deux tables à prendre séparément (hors périmètre Lot 1).
CREATE TABLE IF NOT EXISTS audit_log (
  id            SERIAL PRIMARY KEY,
  restaurant_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id),
  action        VARCHAR(100) NOT NULL,
  entity_type   VARCHAR(50) NOT NULL,
  entity_id     INTEGER,
  details       JSONB DEFAULT '{}'::jsonb,
  ip_address    VARCHAR(45),
  result        VARCHAR(20) NOT NULL DEFAULT 'success',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_restaurant ON audit_log (restaurant_id, created_at);

-- ---------- Index de performance ----------
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_status ON orders (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_received_at ON orders (received_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_categories_restaurant ON menu_categories (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_restaurant ON suppliers (restaurant_id);

-- ---------- Trigger updated_at (guillemets simples — cf. bug noté dans
--            prophet-service/app.py:153, corrigé ici dès le départ) ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_menu_items_updated_at ON menu_items;
CREATE TRIGGER trg_menu_items_updated_at BEFORE UPDATE ON menu_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS audit_log CASCADE;
-- DROP TABLE IF EXISTS order_status_history CASCADE;
-- DROP TABLE IF EXISTS order_items CASCADE;
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS menu_item_channel_overrides CASCADE;
-- DROP TABLE IF EXISTS menu_items CASCADE;
-- DROP TABLE IF EXISTS menu_categories CASCADE;
-- DROP TABLE IF EXISTS menus CASCADE;
-- DROP TABLE IF EXISTS suppliers CASCADE;
-- DROP TABLE IF EXISTS delivery_platforms CASCADE;
-- DROP TABLE IF EXISTS sales_channels CASCADE;
-- DROP FUNCTION IF EXISTS set_updated_at();
-- COMMIT;
