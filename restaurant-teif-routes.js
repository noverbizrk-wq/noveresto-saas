// restaurant-teif-routes.js
// Monté sur /api/v1/restaurant/* dans server.js.
//
// Malgré le nom (historique — la route existait déjà pour la Tunisie
// avant que les autres pays soient supportés), gère désormais TOUS les
// pays : invoice-service.js choisit TEIF (Tunisie) ou PDF (le reste)
// selon le pays du restaurant. Renommer casserait le contrat déjà
// utilisé par le frontend (app/dashboard/restaurant/orders/page.tsx).
//
// ⚠️ Tunisie : génère uniquement le XML — pas de signature ni de
// soumission réelle à l'API TTN (nécessite un certificat TUNTRUST et des
// identifiants API que Ridha doit obtenir lui-même après inscription sur
// El Fatoora).
// ⚠️ Autres pays : PDF commercial simple, pas un format structuré
// (Factur-X/UBL) conforme à la réforme de facturation électronique
// obligatoire — cf. avertissement dans pdf-invoice-service.js.

const express = require('express');
const router = express.Router();
const invoiceService = require('./services/invoice-service');
const teifService = require('./services/teif-service');
const mailer = require('./services/mailer-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const teifAccess = require('./middleware/module-access-middleware')(pool, 'finance');
  // Rattaché au module 'finance' déjà existant plutôt que d'en créer un
  // nouveau — la facturation est une extension naturelle de ce module.

  // POST /api/v1/restaurant/orders/:orderId/teif-invoice
  // { customer_name, customer_tax_id?, customer_address?, customer_city?, customer_postal_code?, customer_email? }
  // customer_tax_id : obligatoire seulement pour la Tunisie (format TEIF) —
  // la validation exacte est faite dans generateTEIF()/generateInvoicePDF()
  // selon le format choisi, pas ici (les exigences different par pays).
  router.post('/orders/:orderId/teif-invoice', restaurantScope, teifAccess, async (req, res) => {
    try {
      const { customer_tax_id, customer_name, customer_address, customer_city, customer_postal_code, customer_email } = req.body;
      if (!customer_name || !customer_name.trim()) {
        return res.status(400).json({ error: 'Le nom du client est requis' });
      }
      const result = await invoiceService.createInvoice(pool, req.scopedRestaurantId, req.params.orderId, {
        tax_id: customer_tax_id ? customer_tax_id.trim() : null,
        name: customer_name.trim(),
        address: customer_address,
        city: customer_city,
        postal_code: customer_postal_code,
        email: customer_email,
      }, req.user?.id);

      // Copie de courtoisie par email si une adresse client a ete fournie.
      // Best-effort : la facture reste creee meme si l'envoi echoue.
      if (customer_email && customer_email.trim()) {
        const restaurantName = req.user?.restaurant || 'votre restaurant';
        const isXml = result.document_format === 'teif_xml';
        mailer.sendEmail({
          to: customer_email.trim(),
          ...mailer.invoiceEmail(restaurantName, result.invoice_number, result.totals, result.document_format, result.currency),
          attachments: [{
            filename: `${result.invoice_number}.${isXml ? 'xml' : 'pdf'}`,
            content: isXml ? result.xml : result.pdf
          }]
        }).catch(e => console.error('[teif] envoi email facture echoue (non bloquant):', e.message));
      }

      delete result.xml; delete result.pdf; // ne font pas partie de la reponse API habituelle
      // currency reste dans la reponse (utile a l'affichage cote frontend)
      res.status(201).json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/orders/:orderId/teif-invoice
  router.get('/orders/:orderId/teif-invoice', restaurantScope, teifAccess, async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoice(pool, req.scopedRestaurantId, req.params.orderId);
      if (!invoice) return res.status(404).json({ error: 'Aucune facture pour cette commande' });
      delete invoice.teif_xml; delete invoice.document_pdf; // potentiellement volumineux, pas necessaire pour l'aperçu
      res.json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/orders/:orderId/teif-invoice/download
  router.get('/orders/:orderId/teif-invoice/download', restaurantScope, teifAccess, async (req, res) => {
    try {
      const invoice = await invoiceService.getInvoice(pool, req.scopedRestaurantId, req.params.orderId);
      if (!invoice) return res.status(404).json({ error: 'Aucune facture pour cette commande' });
      if (invoice.document_format === 'pdf') {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.pdf"`);
        res.send(invoice.document_pdf);
      } else {
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.xml"`);
        res.send(invoice.teif_xml);
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/teif-invoices — liste de toutes les factures générées
  router.get('/teif-invoices', restaurantScope, teifAccess, async (req, res) => {
    try {
      const data = await invoiceService.listInvoices(pool, req.scopedRestaurantId);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/tax-profile — coordonnées fiscales du restaurant (émetteur)
  // { tax_id, address, city, postal_code }
  router.patch('/tax-profile', restaurantScope, async (req, res) => {
    try {
      const updated = await teifService.updateSupplierTaxInfo(pool, req.scopedRestaurantId, req.body);
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
