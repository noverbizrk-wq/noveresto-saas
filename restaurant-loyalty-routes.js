// restaurant-loyalty-routes.js
//
// Expose le programme de fidelite (Phase A) : stats agregees + niveaux
// (pour l'ecran Fidelisation) et liste des clients avec solde de points.

const express = require('express');
const router = express.Router();
const loyaltyService = require('./services/loyalty-service');

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

  return router;
};
