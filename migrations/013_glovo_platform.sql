-- ============================================================
-- Migration 013 — Intégration Glovo (réception de commandes + statuts)
--
-- Portée : réception de commandes via webhook + envoi des statuts de
-- préparation vers Glovo (ACCEPTED, READY_FOR_PICKUP). Réutilise les
-- tables déjà construites pour Deliveroo (restaurant_delivery_connections,
-- menu_item_external_refs, delivery_webhook_log) — génériques par
-- conception, pas besoin de nouvelles tables, juste la ligne de
-- référence Glovo manquante dans delivery_platforms.
--
-- ⚠️ Prérequis avant usage réel : compte développeur Glovo
-- (qcommerce-integrations.glovoapp.com), accord partenaire signé,
-- identifiants OAuth2 (client_id/client_secret) obtenus après validation
-- par l'équipe d'intégration Glovo — processus plus long qu'un simple
-- portail en libre-service.
-- ============================================================

BEGIN;

INSERT INTO delivery_platforms (code, label, connector_status)
VALUES ('glovo', 'Glovo', 'sandbox')
ON CONFLICT (code) DO NOTHING;

COMMIT;
