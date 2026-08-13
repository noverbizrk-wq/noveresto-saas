// restaurant-purchase-suggestions-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que
// restaurant-costing-routes.js. Gated par le module 'purchases' (déjà
// existant dans module_access).

const express = require('express');
const router = express.Router();
const suggestionService = require('./services/purchase-suggestion-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const moduleAccessMiddleware = require('./middleware/module-access-middleware');
  const purchasesAccess = moduleAccessMiddleware(pool, 'purchases');

  // GET /api/v1/restaurant/purchase-suggestions?status=pending
  router.get('/purchase-suggestions', restaurantScope, purchasesAccess, async (req, res) => {
    const status = req.query.status || 'pending';
    const validStatuses = ['pending', 'validated', 'rejected', 'expired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `status doit être un de : ${validStatuses.join(', ')}` });
    }
    try {
      const result = await pool.query(
        `SELECT ps.*, i.name AS ingredient_name, s.name AS supplier_name
         FROM purchase_suggestions ps
         JOIN ingredients i ON i.id = ps.ingredient_id
         LEFT JOIN suppliers s ON s.id = ps.supplier_id
         WHERE ps.restaurant_id = $1 AND ps.status = $2
         ORDER BY ps.generated_at DESC`,
        [req.scopedRestaurantId, status]
      );
      res.json({ data: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/purchase-suggestions/generate
  // Déclenche le calcul pour tous les ingrédients auto_suggest_enabled=true
  // (appelé par le job planifié quotidien, ou manuellement).
  router.post('/purchase-suggestions/generate', restaurantScope, purchasesAccess, async (req, res) => {
    try {
      const created = await suggestionService.generateForRestaurant(pool, req.scopedRestaurantId);
      res.json({ created });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/purchase-suggestions/:id/validate
  // Crée la vraie purchase_order + purchase_order_item, marque validée.
  router.post('/purchase-suggestions/:id/validate', restaurantScope, purchasesAccess, async (req, res) => {
    try {
      const result = await suggestionService.validateSuggestion(
        pool, req.scopedRestaurantId, req.params.id, req.user.id, req.body.adjusted_quantity
      );
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/purchase-suggestions/:id/reject
  router.post('/purchase-suggestions/:id/reject', restaurantScope, purchasesAccess, async (req, res) => {
    try {
      await suggestionService.rejectSuggestion(pool, req.scopedRestaurantId, req.params.id, req.user.id);
      res.json({ id: req.params.id, status: 'rejected' });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/ingredients/:id/auto-suggest
  // Bascule auto_suggest_enabled / lead_time_days pour un ingrédient
  // (complète restaurant-costing-routes.js PATCH /ingredients/:id existant,
  // séparé ici pour ne pas toucher au fichier costing déjà en prod).
  router.patch('/ingredients/:id/auto-suggest', restaurantScope, purchasesAccess, async (req, res) => {
    const { auto_suggest_enabled, lead_time_days } = req.body;
    const updates = [];
    const params = [];
    let idx = 1;
    if (auto_suggest_enabled !== undefined) { updates.push(`auto_suggest_enabled = $${idx++}`); params.push(auto_suggest_enabled); }
    if (lead_time_days !== undefined) { updates.push(`lead_time_days = $${idx++}`); params.push(lead_time_days); }
    if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
    params.push(req.params.id, req.scopedRestaurantId);
    try {
      const result = await pool.query(
        `UPDATE ingredients SET ${updates.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Ingrédient introuvable' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
