-- ============================================================
-- Migration 005 — Module "Gestion du restaurant" — Lot 4
-- Finance et TVA
--
-- Ajoute un snapshot vat_rate sur order_items, sur le même principe que
-- item_name/unit_price déjà snapshotés en Lot 1 : le taux de TVA appliqué
-- à une commande passée ne doit pas changer rétroactivement si le taux
-- de l'article est modifié plus tard dans le menu.
--
-- Backfill : les lignes de commande déjà existantes récupèrent le taux
-- actuellement défini sur leur article (meilleure approximation possible
-- en l'absence d'historique — à partir de cette migration, le taux est
-- capturé au moment de la commande).
-- ============================================================

BEGIN;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS vat_rate NUMERIC(5,2) NOT NULL DEFAULT 19;

UPDATE order_items oi
SET vat_rate = mi.vat_rate
FROM menu_items mi
WHERE oi.menu_item_id = mi.id;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- ALTER TABLE order_items DROP COLUMN IF EXISTS vat_rate;
