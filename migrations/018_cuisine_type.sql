-- ============================================================
-- Migration 018 — cuisine_type par restaurant
--
-- Utilise par le module Social Media IA. Auparavant code en dur
-- ("Restauration rapide halal", top_dishes fixes sur des burgers)
-- cote frontend pour TOUS les restaurants, quel que soit leur type
-- de cuisine reel.
--
-- top_dishes et avg_ticket ne sont PAS stockes ici : ils sont
-- calcules a la volee depuis les vraies ventes (order_items),
-- pour rester toujours a jour sans champ a resaisir manuellement.
-- ============================================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS cuisine_type VARCHAR(200);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE users DROP COLUMN IF EXISTS cuisine_type;
-- COMMIT;
