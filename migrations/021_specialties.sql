-- ============================================================
-- Migration 021 — specialties par restaurant
--
-- Complete cuisine_type (migration 018). cuisine_type = type de cuisine
-- ("Tacos et fast-food halal"), specialties = plats phares saisis par le
-- restaurateur lui-meme a l'inscription ("Sauce fromagere maison, Smash
-- Burger, Giga Tacos"). Sert de fallback pour le module Social Media IA
-- tant qu'un nouveau compte n'a pas encore de vraies ventes enregistrees
-- dans NoveResto (top_dishes ne peut alors pas etre calcule depuis les
-- commandes reelles).
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS specialties TEXT;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS specialties;
-- COMMIT;
