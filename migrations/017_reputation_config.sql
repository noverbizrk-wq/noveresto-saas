-- ============================================================
-- Migration 017 — Config reputation par restaurant
--
-- Corrige un trou de modelisation : le module Reputation utilisait
-- une seule variable d'environnement globale (GOOGLE_PLACE_ID) pour
-- TOUS les restaurants, donc chaque restaurant affichait les avis
-- Google du meme etablissement (celui configure en env sur le serveur).
--
-- Les cles API (GOOGLE_PLACES_API_KEY, FACEBOOK_ACCESS_TOKEN) restent
-- des credentials globaux legitimes (un seul compte API pour tout le
-- SaaS) — seul l'identifiant DE QUEL etablissement differe par
-- restaurant, d'ou son stockage en base plutot qu'en env.
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(200);
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_page_id VARCHAR(200);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS google_place_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS facebook_page_id;
-- COMMIT;
