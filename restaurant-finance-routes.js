// restaurant-finance-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-3.

const express = require('express');
const router = express.Router();
const financeService = require('./services/finance-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const financeAccess = require('./middleware/module-access-middleware')(pool, 'finance');

  // GET /api/v1/restaurant/finance/vat-breakdown?from=&to=
  router.get('/finance/vat-breakdown', restaurantScope, financeAccess, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
      const data = await financeService.getVatBreakdown(pool, req.scopedRestaurantId, from, to);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/finance/channel-breakdown?from=&to=
  router.get('/finance/channel-breakdown', restaurantScope, financeAccess, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
      const data = await financeService.getChannelBreakdown(pool, req.scopedRestaurantId, from, to);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/finance/export.csv?from=&to=
  router.get('/finance/export.csv', restaurantScope, financeAccess, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
      const csv = await financeService.generateOrdersCsv(pool, req.scopedRestaurantId, from, to);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="commandes_${from}_${to}.csv"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
