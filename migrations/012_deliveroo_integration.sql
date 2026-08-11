-- ============================================================
-- Migration 012 — Intégration Deliveroo (réception de commandes)
--
-- Portée : réception de commandes via webhook (Order Events API).
-- Ne couvre PAS la publication du menu vers Deliveroo (Menu API) —
-- à construire séparément une fois cette première brique validée.
--
-- Prérequis avant toute utilisation réelle : un compte sur le portail
-- développeur Deliveroo (developers.deliveroo.com), des identifiants
-- API (client-id/client-secret) et un webhook-secret obtenus après
-- inscription — aucun de ces éléments n'est fourni par cette migration,
-- ils doivent être saisis manuellement par restaurant.
-- ============================================================

BEGIN;

-- Connexion Deliveroo propre à chaque restaurant (un restaurant peut
-- avoir son propre compte/site Deliveroo, distinct de celui d'un autre
-- restaurant sur la même instance NoveResto).
CREATE TABLE IF NOT EXISTS restaurant_delivery_connections (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delivery_platform_id  INTEGER NOT NULL REFERENCES delivery_platforms(id),
  external_site_id      VARCHAR(100),
  -- Identifiant du restaurant/site côté Deliveroo — utilisé pour
  -- retrouver quel restaurant NoveResto correspond à une commande
  -- entrante. Exact nom de champ dans le payload à confirmer contre un
  -- vrai webhook de test (voir note dans le service).
  webhook_secret        VARCHAR(300),
  api_key               VARCHAR(300),
  api_secret             VARCHAR(300),
  status                VARCHAR(20) NOT NULL DEFAULT 'inactive',
  -- inactive | sandbox | active | error
  last_order_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, delivery_platform_id)
);

-- Correspondance entre un article de menu NoveResto et son identifiant
-- côté plateforme de livraison — nécessaire car order_items.menu_item_id
-- est une clé étrangère obligatoire (pas de rapprochement approximatif
-- par nom possible, plus fiable ainsi).
CREATE TABLE IF NOT EXISTS menu_item_external_refs (
  id                    SERIAL PRIMARY KEY,
  menu_item_id          INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  delivery_platform_id  INTEGER NOT NULL REFERENCES delivery_platforms(id),
  external_item_id      VARCHAR(150) NOT NULL,
  external_name         VARCHAR(200),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_platform_id, external_item_id)
);

-- Journal des webhooks reçus, y compris ceux en échec — pour ne jamais
-- perdre une commande même si le mapping d'articles est incomplet
-- (permet une réconciliation manuelle plutôt qu'une perte silencieuse).
CREATE TABLE IF NOT EXISTS delivery_webhook_log (
  id                    SERIAL PRIMARY KEY,
  delivery_platform_id  INTEGER REFERENCES delivery_platforms(id),
  restaurant_id         INTEGER REFERENCES users(id),
  event_type            VARCHAR(50),
  raw_payload           JSONB NOT NULL,
  signature_valid       BOOLEAN,
  processing_status     VARCHAR(20) NOT NULL DEFAULT 'received',
  -- received | order_created | error_signature | error_mapping | error_other
  error_message         TEXT,
  order_id              INTEGER REFERENCES orders(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_webhook_log_status ON delivery_webhook_log (processing_status, created_at);

COMMIT;
