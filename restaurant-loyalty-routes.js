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
