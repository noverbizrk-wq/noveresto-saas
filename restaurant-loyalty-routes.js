// restaurant-loyalty-routes.js
//
// Expose le programme de fidelite (Phase A) : stats agregees + niveaux
// (pour l'ecran Fidelisation) et liste des clients avec solde de points.

const express = require('express');
const router = express.Router();
const loyaltyService = require('./services/loyalty-service');
const campaignService = require('./services/loyalty-campaign-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const moduleAccessMiddleware = require('./middleware/module-access-middleware');
  const overviewAccess = moduleAccessMiddleware(pool, 'overview');

  // GET /api/v1/restaurant/loyalty/overview
  router.get('/loyalty/overview', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const stats = await loyaltyService.getStats(pool, req.scopedRestaurantId);
      res.json(stats);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/loyalty/customers
  router.get('/loyalty/customers', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const customers = await loyaltyService.listCustomers(pool, req.scopedRestaurantId);
      res.json({ data: customers });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/loyalty/customers/:id/birthday
  router.patch('/loyalty/customers/:id/birthday', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const updated = await campaignService.updateCustomerBirthday(pool, req.scopedRestaurantId, req.params.id, req.body.birthday);
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/loyalty/customers/:id — fiche detaillee
  // (historique commandes + grand-livre complet des points + notes)
  router.get('/loyalty/customers/:id', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const detail = await loyaltyService.getCustomerDetail(pool, req.scopedRestaurantId, req.params.id);
      res.json(detail);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/loyalty/customers/:id/notes
  router.patch('/loyalty/customers/:id/notes', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const updated = await loyaltyService.updateCustomerNotes(pool, req.scopedRestaurantId, req.params.id, req.body.notes);
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // DELETE /api/v1/restaurant/loyalty/customers/:id — suppression physique
  // (sure : cascade sur loyalty_points_ledger, orders.customer_id -> NULL)
  router.delete('/loyalty/customers/:id', restaurantScope, overviewAccess, async (req, res) => {
    try {
      await loyaltyService.deleteCustomer(pool, req.scopedRestaurantId, req.params.id);
      res.status(204).send();
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/loyalty/customers — ajout manuel, sans commande
  router.post('/loyalty/customers', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const created = await loyaltyService.createCustomer(pool, req.scopedRestaurantId, req.body);
      res.status(201).json(created);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/loyalty/customers/import — import CSV en masse.
  // Le CSV est parse cote client (meme convention que /api/v1/import/csv) :
  // { rows: [{ phone, name, birthday }, ...] }
  router.post('/loyalty/customers/import', restaurantScope, overviewAccess, async (req, res) => {
    const { rows } = req.body;
    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Donnees CSV manquantes' });
    }
    try {
      const result = await loyaltyService.importCustomersCsv(pool, req.scopedRestaurantId, rows);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/loyalty/campaigns/winback
  // Candidats win-back + lien WhatsApp pre-rempli (envoi manuel, aucun
  // fournisseur SMS/WhatsApp Business API requis).
  router.get('/loyalty/campaigns/winback', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const userRes = await pool.query('SELECT restaurant FROM users WHERE id = $1', [req.scopedRestaurantId]);
      const restaurantName = userRes.rows[0]?.restaurant || 'notre restaurant';
      const candidates = await campaignService.getWinbackCandidates(pool, req.scopedRestaurantId, restaurantName);
      res.json({ data: candidates });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/loyalty/campaigns/birthday
  router.get('/loyalty/campaigns/birthday', restaurantScope, overviewAccess, async (req, res) => {
    try {
      const userRes = await pool.query('SELECT restaurant FROM users WHERE id = $1', [req.scopedRestaurantId]);
      const restaurantName = userRes.rows[0]?.restaurant || 'notre restaurant';
      const candidates = await campaignService.getBirthdayCandidates(pool, req.scopedRestaurantId, restaurantName);
      res.json({ data: candidates });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
