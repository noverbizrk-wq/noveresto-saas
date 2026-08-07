-- ============================================================
-- Migration 009 — Module "Gestion du restaurant" — Lot 9 (complément 3)
-- Téléphone au format international, pour construire des liens WhatsApp
-- (wa.me) fiables — le format local seul ("29 618 478") ne suffit pas,
-- il faut l'indicatif pays.
-- ============================================================

BEGIN;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS phone_international VARCHAR(30);

COMMIT;
