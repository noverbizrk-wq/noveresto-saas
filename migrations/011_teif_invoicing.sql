-- ============================================================
-- Migration 011 — Facturation électronique TEIF (Lot 12)
--
-- Portée assumée : génération de facture TEIF à la demande, pour une
-- commande spécifique — typiquement un client professionnel qui demande
-- une vraie facture (B2B), pas une génération automatique de TOUTES les
-- commandes. Cette portée reste à confirmer avec un expert-comptable
-- tunisien (l'obligation exacte pour la restauration B2C n'est pas
-- tranchée de façon certaine dans les sources disponibles).
--
-- Cette migration NE couvre PAS la signature électronique (certificat
-- TUNTRUST requis, non disponible) ni la soumission réelle à l'API TTN
-- (identifiants API requis, non disponibles) — uniquement la génération
-- du document XML conforme à la structure, prêt à être signé/soumis une
-- fois ces prérequis obtenus.
-- ============================================================

BEGIN;

-- Coordonnées fiscales de l'émetteur (le restaurant) — absentes jusqu'ici,
-- pourtant obligatoires sur toute facture TEIF. Nullable : à renseigner
-- par chaque compte avant de pouvoir générer une facture.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tax_id VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS address VARCHAR(300);
ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS postal_code VARCHAR(20);

CREATE TABLE IF NOT EXISTS teif_invoices (
  id                SERIAL PRIMARY KEY,
  restaurant_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id          INTEGER NOT NULL REFERENCES orders(id),
  invoice_number    VARCHAR(50) NOT NULL,
  customer_tax_id   VARCHAR(50) NOT NULL,
  customer_name     VARCHAR(300) NOT NULL,
  customer_address  TEXT,
  customer_city     VARCHAR(100),
  customer_postal_code VARCHAR(20),
  teif_xml          TEXT NOT NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'generated',
  -- 'generated' (XML prêt, non signé) | 'signed' | 'submitted' | 'error'
  -- Champs remplis uniquement une fois la signature/soumission réelle
  -- intégrée (hors périmètre de ce lot) :
  ttn_invoice_id    VARCHAR(100),
  created_by        INTEGER REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, order_id)
  -- Une seule facture TEIF par commande — évite les doublons si le
  -- bouton "Générer" est cliqué plusieurs fois par erreur.
);

CREATE INDEX IF NOT EXISTS idx_teif_invoices_restaurant ON teif_invoices (restaurant_id);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- DROP TABLE IF EXISTS teif_invoices CASCADE;
-- ALTER TABLE users DROP COLUMN IF EXISTS tax_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS address;
-- ALTER TABLE users DROP COLUMN IF EXISTS city;
-- ALTER TABLE users DROP COLUMN IF EXISTS postal_code;
-- COMMIT;
