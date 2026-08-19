-- ============================================================
-- Migration 025 — Generalise teif_invoices pour supporter plusieurs pays
--
-- Jusqu'ici cette table ne stockait que des factures TEIF (Tunisie,
-- XML). Le nom de la table reste "teif_invoices" (pas de rename — la
-- route API /orders/:id/teif-invoice existe deja et est utilisee par le
-- frontend, cf. app/dashboard/restaurant/orders/page.tsx ; renommer
-- casserait ce contrat pour un gain cosmetique) mais elle porte
-- desormais aussi des factures PDF simples pour les autres pays
-- (France, Maroc, etc.) via document_format/document_pdf.
--
-- customer_tax_id et teif_xml deviennent nullable : obligatoires
-- uniquement pour le format 'teif_xml' (Tunisie), la validation se fait
-- cote service (invoice-service.js), pas au niveau de la contrainte SQL,
-- car les deux formats ont des exigences differentes.
-- ============================================================

BEGIN;

ALTER TABLE teif_invoices ALTER COLUMN teif_xml DROP NOT NULL;
ALTER TABLE teif_invoices ALTER COLUMN customer_tax_id DROP NOT NULL;

ALTER TABLE teif_invoices ADD COLUMN IF NOT EXISTS document_format VARCHAR(10) NOT NULL DEFAULT 'teif_xml';
ALTER TABLE teif_invoices ADD CONSTRAINT chk_teif_invoices_document_format CHECK (document_format IN ('teif_xml', 'pdf'));

ALTER TABLE teif_invoices ADD COLUMN IF NOT EXISTS document_pdf BYTEA;

COMMIT;

-- ============================================================
-- DOWN (rollback manuel)
-- ============================================================
-- BEGIN;
-- ALTER TABLE teif_invoices DROP COLUMN IF EXISTS document_pdf;
-- ALTER TABLE teif_invoices DROP CONSTRAINT IF EXISTS chk_teif_invoices_document_format;
-- ALTER TABLE teif_invoices DROP COLUMN IF EXISTS document_format;
-- ALTER TABLE teif_invoices ALTER COLUMN customer_tax_id SET NOT NULL;
-- ALTER TABLE teif_invoices ALTER COLUMN teif_xml SET NOT NULL;
-- COMMIT;
