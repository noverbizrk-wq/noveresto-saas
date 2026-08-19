-- ============================================================
-- Migration 024 — Email client sur les factures TEIF
--
-- teif_invoices.customer_email : optionnel (contrairement au matricule
-- fiscal et au nom, deja obligatoires). Permet d'envoyer une copie de la
-- facture (XML en piece jointe) au client B2B au moment de la generation.
-- Rappel : ce document n'a pas de valeur legale tant qu'il n'est pas
-- signe/soumis a TTN (cf. commentaire teif-service.js) — l'email est une
-- transmission de courtoisie, pas une soumission fiscale.
-- ============================================================

BEGIN;

ALTER TABLE teif_invoices ADD COLUMN IF NOT EXISTS customer_email VARCHAR(255);

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE teif_invoices DROP COLUMN IF EXISTS customer_email;
-- COMMIT;
