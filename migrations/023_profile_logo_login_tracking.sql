-- ============================================================
-- Migration 023 — Logo restaurant, historique de connexion,
-- invalidation JWT sur changement de mot de passe
--
-- users.logo_url            : URL du logo (affiche sidebar/topbar/profil).
--                              Pas de stockage de fichier cote serveur pour
--                              rester "peu d'effort" — l'utilisateur colle
--                              l'URL d'une image deja hebergee ailleurs.
-- users.last_login_at       : mis a jour a chaque login reussi (visibilite
--                              admin sur les comptes actifs/inactifs).
-- users.password_changed_at : compare a l'iat du JWT dans authMiddleware —
--                              un token emis AVANT un changement de mot de
--                              passe devient invalide (meme mecanisme que
--                              is_active, meme corriger les deux trous a la
--                              fois : token vole + mdp change, et compte
--                              desactive avec un token deja en circulation).
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS password_changed_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
-- ALTER TABLE users DROP COLUMN IF EXISTS logo_url;
-- COMMIT;
