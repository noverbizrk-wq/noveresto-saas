// restaurant-costing-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que le Lot 1.

const express = require('express');
const router = express.Router();
const costingService = require('./services/costing-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // ---------- Ingrédients ----------

  router.get('/ingredients', restaurantScope, async (req, res) => {
    const result = await pool.query(
      `SELECT i.*, s.name AS supplier_name
       FROM ingredients i
       LEFT JOIN suppliers s ON s.id = i.supplier_id
       WHERE i.restaurant_id = $1
       ORDER BY i.name`,
      [req.scopedRestaurantId]
    );
    res.json({ data: result.rows });
  });

  router.post('/ingredients', restaurantScope, async (req, res) => {
    try {
      const { name, unit, current_stock, min_stock, unit_cost, supplier_id } = req.body;
      if (!name) return res.status(400).json({ error: 'name requis' });
      const result = await pool.query(
        `INSERT INTO ingredients (restaurant_id, name, unit, current_stock, min_stock, unit_cost, supplier_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.scopedRestaurantId, name, unit || 'kg', current_stock || 0, min_stock || 0, unit_cost || 0, supplier_id || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/ingredients/:id', restaurantScope, async (req, res) => {
    try {
      const fields = ['name', 'unit', 'min_stock', 'unit_cost', 'supplier_id'];
      const updates = [];
      const params = [];
      let idx = 1;
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
      params.push(req.params.id, req.scopedRestaurantId);
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

  // Alertes stock faible (ingrédients sous leur seuil min)
  router.get('/ingredients/alerts/low-stock', restaurantScope, async (req, res) => {
    const result = await pool.query(
      `SELECT * FROM ingredients
       WHERE restaurant_id = $1 AND current_stock <= min_stock AND min_stock > 0
       ORDER BY (current_stock - min_stock) ASC`,
      [req.scopedRestaurantId]
    );
    res.json({ data: result.rows });
  });

  // ---------- Fiches techniques (recettes) ----------

  // GET /api/v1/restaurant/recipe-ingredients?menu_item_id=
  router.get('/recipe-ingredients', restaurantScope, async (req, res) => {
    const { menu_item_id } = req.query;
    if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id requis' });

    // Vérifier que l'article appartient bien au restaurant scopé
    const owns = await pool.query(
      'SELECT id FROM menu_items WHERE id = $1 AND restaurant_id = $2',
      [menu_item_id, req.scopedRestaurantId]
    );
    if (owns.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });

    const result = await pool.query(
      `SELECT ri.*, i.name AS ingredient_name, i.unit, i.unit_cost
       FROM recipe_ingredients ri
       JOIN ingredients i ON i.id = ri.ingredient_id
       WHERE ri.menu_item_id = $1
       ORDER BY i.name`,
      [menu_item_id]
    );
    res.json({ data: result.rows });
  });

  router.post('/recipe-ingredients', restaurantScope, async (req, res) => {
    try {
      const { menu_item_id, ingredient_id, quantity } = req.body;
      if (!menu_item_id || !ingredient_id || quantity === undefined) {
        return res.status(400).json({ error: 'menu_item_id, ingredient_id, quantity requis' });
      }
      const owns = await pool.query(
        'SELECT id FROM menu_items WHERE id = $1 AND restaurant_id = $2',
        [menu_item_id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });

      const result = await pool.query(
        `INSERT INTO recipe_ingredients (menu_item_id, ingredient_id, quantity)
         VALUES ($1,$2,$3)
         ON CONFLICT (menu_item_id, ingredient_id) DO UPDATE SET quantity = EXCLUDED.quantity
         RETURNING *`,
        [menu_item_id, ingredient_id, quantity]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/recipe-ingredients/:id', restaurantScope, async (req, res) => {
    const result = await pool.query(
      `DELETE FROM recipe_ingredients ri
       USING menu_items mi
       WHERE ri.id = $1 AND ri.menu_item_id = mi.id AND mi.restaurant_id = $2
       RETURNING ri.id`,
      [req.params.id, req.scopedRestaurantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Ligne de recette introuvable' });
    res.status(204).send();
  });

  // ---------- Coûts et marges ----------

  // GET /api/v1/restaurant/menu-items/:id/cost
  router.get('/menu-items/:id/cost', restaurantScope, async (req, res) => {
    try {
      const owns = await pool.query(
        'SELECT id FROM menu_items WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });

      const cost = await costingService.getMenuItemCost(pool, req.params.id);
      res.json(cost);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/costs/summary — vue synthétique tous articles
  router.get('/costs/summary', restaurantScope, async (req, res) => {
    try {
      const costs = await costingService.getAllMenuItemCosts(pool, req.scopedRestaurantId);
      res.json({ data: costs });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
