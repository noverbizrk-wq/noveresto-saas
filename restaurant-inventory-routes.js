// restaurant-inventory-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que
// restaurant-costing-routes.js. Gated sur le module 'stocks' existant.

const express = require('express');
const router = express.Router();
const inventoryService = require('./services/inventory-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const moduleAccessMiddleware = require('./middleware/module-access-middleware');
  const stocksAccess = moduleAccessMiddleware(pool, 'stocks');

  // POST /api/v1/restaurant/inventory-counts
  router.post('/inventory-counts', restaurantScope, stocksAccess, async (req, res) => {
    const { ingredient_id, counted_quantity, note } = req.body;
    if (!ingredient_id || counted_quantity === undefined) {
      return res.status(400).json({ error: 'ingredient_id et counted_quantity requis' });
    }
    try {
      const count = await inventoryService.recordCount(pool, ingredient_id, counted_quantity, {
        restaurantId: req.scopedRestaurantId,
        userId: req.user?.id,
        note
      });
      res.status(201).json(count);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/inventory-counts?ingredient_id=&limit=
  router.get('/inventory-counts', restaurantScope, stocksAccess, async (req, res) => {
    const { ingredient_id, limit = 50 } = req.query;
    const conditions = ['ic.restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    let idx = 2;
    if (ingredient_id) { conditions.push(`ic.ingredient_id = $${idx++}`); params.push(ingredient_id); }
    params.push(Number(limit));

    const result = await pool.query(
      `SELECT ic.*, i.name AS ingredient_name
       FROM inventory_counts ic
       JOIN ingredients i ON i.id = ic.ingredient_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY ic.counted_at DESC
       LIMIT $${idx}`,
      params
    );
    res.json({ data: result.rows });
  });

  // GET /api/v1/restaurant/inventory-counts/variance-summary?from=&to=
  router.get('/inventory-counts/variance-summary', restaurantScope, stocksAccess, async (req, res) => {
    try {
      const summary = await inventoryService.getVarianceSummary(pool, req.scopedRestaurantId, {
        fromDate: req.query.from,
        toDate: req.query.to
      });
      res.json(summary);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
