-- ============================================================
-- Migration 004 — Module "Gestion du restaurant" — Lot 3
-- Personnel/planning, litiges
-- Convention : restaurant_id -> users(id), identique aux Lots 1-2.
--
-- Périmètre volontairement borné (MVP) :
-- - Pas de calendrier drag-and-drop, plannings = liste de créneaux
-- - Pas d'infrastructure d'upload de fichiers : dispute_evidence stocke
--   une URL (photo déjà hébergée ailleurs), pas de gestion de fichiers
-- - Pas de FK sur reviews.id (schéma exact de la table `reviews` existante
--   non confirmé par l'audit au-delà de sa présence) — review_id stocké
--   en INTEGER libre, non contraint
-- ============================================================

BEGIN;

-- ---------- Personnel ----------
CREATE TABLE IF NOT EXISTS employees (
  id             SERIAL PRIMARY KEY,
  restaurant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           VARCHAR(200) NOT NULL,
  role           VARCHAR(50) NOT NULL DEFAULT 'equipier',
  -- valeurs indicatives : manager, chef_cuisine, cuisinier, equipier, caissier, serveur
  phone          VARCHAR(30),
  email          VARCHAR(200),
  hourly_cost    NUMERIC(10,3) NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Planning (créneaux) ----------
CREATE TABLE IF NOT EXISTS shifts (
  id             SERIAL PRIMARY KEY,
  restaurant_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  employee_id    INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  starts_at      TIMESTAMPTZ NOT NULL,
  ends_at        TIMESTAMPTZ NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'scheduled',
  -- scheduled, confirmed, completed, absent, cancelled
  note           TEXT,
  created_by     INTEGER REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Litiges ----------
CREATE TABLE IF NOT EXISTS disputes (
  id                SERIAL PRIMARY KEY,
  restaurant_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id          INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  review_id         INTEGER,  -- pas de FK, cf. note en tête de fichier
  platform          VARCHAR(30),  -- google, uber_eats, deliveroo, direct...
  reason            VARCHAR(150) NOT NULL,
  amount_requested  NUMERIC(10,3) NOT NULL DEFAULT 0,
  amount_refunded   NUMERIC(10,3) NOT NULL DEFAULT 0,
  status            VARCHAR(30) NOT NULL DEFAULT 'to_analyze',
  -- to_analyze, evidence_needed, contest_prepared, sent, pending,
  -- accepted, partially_accepted, refused, refunded, closed
  due_date          DATE,
  assigned_to       INTEGER REFERENCES users(id),
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id            SERIAL PRIMARY KEY,
  dispute_id    INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  photo_url     TEXT NOT NULL,
  note          TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dispute_status_history (
  id            SERIAL PRIMARY KEY,
  dispute_id    INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  from_status   VARCHAR(30),
  to_status     VARCHAR(30) NOT NULL,
  changed_by    INTEGER REFERENCES users(id),
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Index ----------
CREATE INDEX IF NOT EXISTS idx_employees_restaurant ON employees (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_shifts_restaurant_date ON shifts (restaurant_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_shifts_employee ON shifts (employee_id);
CREATE INDEX IF NOT EXISTS idx_disputes_restaurant_status ON disputes (restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_dispute_evidence_dispute ON dispute_evidence (dispute_id);

-- ---------- Trigger updated_at (réutilise la fonction créée en Lot 1) ----------
DROP TRIGGER IF EXISTS trg_employees_updated_at ON employees;
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_disputes_updated_at ON disputes;
CREATE TRIGGER trg_disputes_updated_at BEFORE UPDATE ON disputes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS dispute_status_history CASCADE;
-- DROP TABLE IF EXISTS dispute_evidence CASCADE;
-- DROP TABLE IF EXISTS disputes CASCADE;
-- DROP TABLE IF EXISTS shifts CASCADE;
-- DROP TABLE IF EXISTS employees CASCADE;
-- COMMIT;
