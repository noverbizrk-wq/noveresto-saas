-- ============================================================
-- Migration 026 — Connexion Google Business Profile (reponse automatique
-- aux avis Google)
--
-- Repondre a un VRAI avis Google Maps necessite l'API Google Business
-- Profile (OAuth2 + scope business.manage), distincte de la Places API
-- deja utilisee (lecture seule, cle API simple) pour recuperer les avis
-- affiches dans le dashboard. Chaque restaurant doit connecter son
-- propre compte Google Business Profile (comme deliveroo/glovo).
--
-- google_business_connections : jetons OAuth par restaurant, meme forme
-- que social_accounts (deja existant pour facebook/instagram/tiktok)
-- mais table dediee : domaine different (reputation, pas publication
-- social), un seul provider (pas de colonne platform a discriminer).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS google_business_connections (
  id                    SERIAL PRIMARY KEY,
  restaurant_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  google_account_name   TEXT NOT NULL,   -- resource name Google, ex: "accounts/1234567890"
  google_location_name  TEXT NOT NULL,   -- ex: "accounts/1234567890/locations/9876543210"
  location_title        VARCHAR(255),
  access_token          TEXT NOT NULL,
  refresh_token         TEXT NOT NULL,
  token_expires_at      TIMESTAMPTZ NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'connected',
  connected_by          INTEGER REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE google_business_connections
  ADD CONSTRAINT chk_google_business_connections_status
  CHECK (status IN ('connected', 'expired', 'error', 'revoked'));

-- google_review_name : resource name complet Google (ex:
-- "accounts/123/locations/456/reviews/AbCdEf...") retourne par l'API
-- Business Profile — necessaire pour publier une reponse
-- (reviews.updateReply). Different de l'id synthetique deja utilise pour
-- les avis recuperes via Places API (google_<timestamp>), qui ne permet
-- PAS de repondre (API differente, lecture seule).
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS google_review_name TEXT;

-- auto_replied : distingue une reponse generee ET publiee automatiquement
-- (zero clic staff, avis non-critique) d'une reponse redigee/validee
-- manuellement par le staff.
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS auto_replied BOOLEAN NOT NULL DEFAULT false;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE reviews DROP COLUMN IF EXISTS auto_replied;
-- ALTER TABLE reviews DROP COLUMN IF EXISTS google_review_name;
-- DROP TABLE IF EXISTS google_business_connections CASCADE;
-- COMMIT;
