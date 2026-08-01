// restaurant-menu-routes.js (révisé post-audit)

const express = require('express');
const router = express.Router();

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // ---------- Menus & catégories ----------

  router.get('/menu-categories', restaurantScope, async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM menu_categories WHERE restaurant_id = $1 ORDER BY position, name',
      [req.scopedRestaurantId]
    );
    res.json({ data: result.rows });
  });

  router.post('/menu-categories', restaurantScope, async (req, res) => {
    const { name, position, menu_id } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    const result = await pool.query(
      'INSERT INTO menu_categories (restaurant_id, menu_id, name, position) VALUES ($1,$2,$3,$4) RETURNING *',
      [req.scopedRestaurantId, menu_id || null, name, position || 0]
    );
    res.status(201).json(result.rows[0]);
  });

  // ---------- Articles de menu (menu_items, ex-"products") ----------

  // GET /api/v1/restaurant/menu-items?restaurant_id=&category_id=&available=
  router.get('/menu-items', restaurantScope, async (req, res) => {
    try {
      const { category_id, available } = req.query;
      const conditions = ['p.restaurant_id = $1'];
      const params = [req.scopedRestaurantId];
      let idx = 2;
      if (category_id) { conditions.push(`p.category_id = $${idx++}`); params.push(category_id); }
      if (available !== undefined) { conditions.push(`p.is_available = $${idx++}`); params.push(available === 'true'); }

      const result = await pool.query(
        `SELECT p.*, mc.name AS category_name
         FROM menu_items p
         LEFT JOIN menu_categories mc ON mc.id = p.category_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY mc.position, p.name`,
        params
      );
      res.json({ data: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/menu-items', restaurantScope, async (req, res) => {
    try {
      const { category_id, name, description, price, vat_rate, photo_url } = req.body;
      if (!name || price === undefined) {
        return res.status(400).json({ error: 'name et price requis' });
      }
      const result = await pool.query(
        `INSERT INTO menu_items (restaurant_id, category_id, name, description, price, vat_rate, photo_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [req.scopedRestaurantId, category_id || null, name, description || null, price, vat_rate ?? 19, photo_url || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/menu-items/:id', restaurantScope, async (req, res) => {
    try {
      const fields = ['name', 'description', 'price', 'vat_rate', 'is_available', 'photo_url', 'category_id'];
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
        `UPDATE menu_items SET ${updates.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/menu-items/:id/availability', restaurantScope, async (req, res) => {
    const { is_available } = req.body;
    const result = await pool.query(
      'UPDATE menu_items SET is_available = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *',
      [is_available, req.params.id, req.scopedRestaurantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });
    res.json(result.rows[0]);
  });

  return router;
};
