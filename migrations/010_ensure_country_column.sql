-- ============================================================
-- Migration 010 — Multi-devises (Lot 11)
-- Garantit la présence de la colonne `country` sur `users` — sans effet
-- si elle existe déjà (elle est utilisée depuis longtemps dans server.js
-- pour l'inscription/admin, cette migration comble juste un doute
-- éventuel plutôt que de supposer qu'elle est bien là).
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(100);

COMMIT;
