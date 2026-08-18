-- ============================================================
-- Migration 020 — Corrige les FK du module Social Media
--
-- 8 tables (social_accounts, restaurant_social_profiles,
-- editorial_calendars, social_posts, ad_campaigns, social_comments,
-- social_token_usage, social_audit_log) reference restaurant_id ->
-- restaurants(id), alors que TOUT le reste du schema utilise la
-- convention restaurant_id -> users(id) (confirme : pas de table
-- restaurants a l'origine, users.id EST le restaurant).
--
-- Verifie avant migration : restaurants et social_posts sont vides
-- (0 lignes chacune), et aucun code actif (server.js) n'ecrit jamais
-- dans une de ces 8 tables — demo/import-route.js est le seul fichier
-- a le faire, et il n'est jamais require() par server.js (code mort).
-- Correctif preventif, sans risque de perte de donnees.
-- ============================================================

BEGIN;

ALTER TABLE social_accounts
  DROP CONSTRAINT social_accounts_restaurant_id_fkey,
  ADD CONSTRAINT social_accounts_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE restaurant_social_profiles
  DROP CONSTRAINT restaurant_social_profiles_restaurant_id_fkey,
  ADD CONSTRAINT restaurant_social_profiles_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE editorial_calendars
  DROP CONSTRAINT editorial_calendars_restaurant_id_fkey,
  ADD CONSTRAINT editorial_calendars_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE social_posts
  DROP CONSTRAINT social_posts_restaurant_id_fkey,
  ADD CONSTRAINT social_posts_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE ad_campaigns
  DROP CONSTRAINT ad_campaigns_restaurant_id_fkey,
  ADD CONSTRAINT ad_campaigns_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE social_comments
  DROP CONSTRAINT social_comments_restaurant_id_fkey,
  ADD CONSTRAINT social_comments_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE social_token_usage
  DROP CONSTRAINT social_token_usage_restaurant_id_fkey,
  ADD CONSTRAINT social_token_usage_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE social_audit_log
  DROP CONSTRAINT social_audit_log_restaurant_id_fkey,
  ADD CONSTRAINT social_audit_log_restaurant_id_fkey
    FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

-- Plus aucune table ne reference restaurants — suppression de la table
-- orpheline (jamais utilisee par le code applicatif, confirme en debut
-- de session precedente).
DROP TABLE IF EXISTS restaurants;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel — recree restaurants vide, FK non restaurees
-- automatiquement car les contraintes exactes dependent de l'etat au
-- moment du rollback ; a adapter si besoin)
-- ============================================================
-- BEGIN;
-- CREATE TABLE restaurants (
--   id SERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, owner_id INTEGER,
--   country VARCHAR(100), currency VARCHAR(10) DEFAULT 'TND',
--   timezone VARCHAR(50) DEFAULT 'Africa/Tunis', plan VARCHAR(50) DEFAULT 'starter',
--   created_at TIMESTAMP DEFAULT now()
-- );
-- COMMIT;
