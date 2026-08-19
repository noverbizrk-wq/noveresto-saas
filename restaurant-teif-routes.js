// restaurant-teif-routes.js
// Monté sur /api/v1/restaurant/* dans server.js.
//
// ⚠️ Génère uniquement le XML — pas de signature ni de soumission réelle
// à l'API TTN (nécessite un certificat TUNTRUST et des identifiants API
// que Ridha doit obtenir lui-même après inscription sur El Fatoora).

const express = require('express');
const router = express.Router();
const teifService = require('./services/teif-service');
const mailer = require('./services/mailer-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const teifAccess = require('./middleware/module-access-middleware')(pool, 'finance');
  // Rattaché au module 'finance' déjà existant plutôt que d'en créer un
  // nouveau — la facturation est une extension naturelle de ce module.

  // POST /api/v1/restaurant/orders/:orderId/teif-invoice
  // { customer_tax_id, customer_name, customer_address?, customer_city?, customer_postal_code?, customer_email? }
  router.post('/orders/:orderId/teif-invoice', restaurantScope, teifAccess, async (req, res) => {
    try {
      const { customer_tax_id, customer_name, customer_address, customer_city, customer_postal_code, customer_email } = req.body;
      if (!customer_tax_id || !customer_tax_id.trim()) {
        return res.status(400).json({ error: 'Le matricule fiscal du client est requis' });
      }
      if (!customer_name || !customer_name.trim()) {
        return res.status(400).json({ error: 'Le nom du client est requis' });
      }
      const result = await teifService.createInvoice(pool, req.scopedRestaurantId, req.params.orderId, {
        tax_id: customer_tax_id.trim(),
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
        mailer.sendEmail({
          to: customer_email.trim(),
          ...mailer.invoiceEmail(restaurantName, result.invoice_number, result.totals),
          attachments: [{ filename: `${result.invoice_number}.xml`, content: result.xml }]
        }).catch(e => console.error('[teif] envoi email facture echoue (non bloquant):', e.message));
      }

      delete result.xml; // ne fait pas partie de la reponse API habituelle
      res.status(201).json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/orders/:orderId/teif-invoice
  router.get('/orders/:orderId/teif-invoice', restaurantScope, teifAccess, async (req, res) => {
    try {
      const invoice = await teifService.getInvoice(pool, req.scopedRestaurantId, req.params.orderId);
      if (!invoice) return res.status(404).json({ error: 'Aucune facture TEIF pour cette commande' });
      res.json(invoice);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/orders/:orderId/teif-invoice/download
  router.get('/orders/:orderId/teif-invoice/download', restaurantScope, teifAccess, async (req, res) => {
    try {
      const invoice = await teifService.getInvoice(pool, req.scopedRestaurantId, req.params.orderId);
      if (!invoice) return res.status(404).json({ error: 'Aucune facture TEIF pour cette commande' });
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice.invoice_number}.xml"`);
      res.send(invoice.teif_xml);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/teif-invoices — liste de toutes les factures générées
  router.get('/teif-invoices', restaurantScope, teifAccess, async (req, res) => {
    try {
      const data = await teifService.listInvoices(pool, req.scopedRestaurantId);
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
