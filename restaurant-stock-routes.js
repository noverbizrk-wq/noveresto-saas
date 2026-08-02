// restaurant-stock-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que le Lot 1.

const express = require('express');
const router = express.Router();
const stockService = require('./services/stock-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // ---------- Mouvements de stock ----------

  // GET /api/v1/restaurant/stock-movements?ingredient_id=&limit=
  router.get('/stock-movements', restaurantScope, async (req, res) => {
    const { ingredient_id, limit = 50 } = req.query;
    const conditions = ['sm.restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    let idx = 2;
    if (ingredient_id) { conditions.push(`sm.ingredient_id = $${idx++}`); params.push(ingredient_id); }
    params.push(Number(limit));

    const result = await pool.query(
      `SELECT sm.*, i.name AS ingredient_name, i.unit
       FROM stock_movements sm
       JOIN ingredients i ON i.id = sm.ingredient_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY sm.created_at DESC
       LIMIT $${idx}`,
      params
    );
    res.json({ data: result.rows });
  });

  // POST /api/v1/restaurant/stock-movements/adjust — correction manuelle
  router.post('/stock-movements/adjust', restaurantScope, async (req, res) => {
    try {
      const { ingredient_id, quantity_delta, movement_type, note } = req.body;
      if (!ingredient_id || quantity_delta === undefined) {
        return res.status(400).json({ error: 'ingredient_id et quantity_delta requis' });
      }
      const owns = await pool.query(
        'SELECT id FROM ingredients WHERE id = $1 AND restaurant_id = $2',
        [ingredient_id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Ingrédient introuvable' });

      await stockService.adjustStock(pool, ingredient_id, quantity_delta, {
        restaurantId: req.scopedRestaurantId,
        userId: req.user?.id,
        movementType: movement_type || 'correction',
        note
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // ---------- Achats fournisseurs ----------

  router.get('/purchase-orders', restaurantScope, async (req, res) => {
    const { status } = req.query;
    const conditions = ['po.restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    if (status) { conditions.push('po.status = $2'); params.push(status); }

    const result = await pool.query(
      `SELECT po.*, s.name AS supplier_name
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po.supplier_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY po.created_at DESC`,
      params
    );
    res.json({ data: result.rows });
  });

  router.get('/purchase-orders/:id', restaurantScope, async (req, res) => {
    const po = await pool.query(
      'SELECT * FROM purchase_orders WHERE id = $1 AND restaurant_id = $2',
      [req.params.id, req.scopedRestaurantId]
    );
    if (po.rows.length === 0) return res.status(404).json({ error: 'Commande d\'achat introuvable' });

    const items = await pool.query(
      `SELECT poi.*, i.name AS ingredient_name, i.unit
       FROM purchase_order_items poi
       JOIN ingredients i ON i.id = poi.ingredient_id
       WHERE poi.purchase_order_id = $1`,
      [req.params.id]
    );
    res.json({ ...po.rows[0], items: items.rows });
  });

  router.post('/purchase-orders', restaurantScope, async (req, res) => {
    const client = await pool.connect();
    try {
      const { supplier_id, items } = req.body;
      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'La commande doit contenir au moins un article' });
      }

      await client.query('BEGIN');

      const totalAmount = items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unit_price), 0);

      const poRes = await client.query(
        `INSERT INTO purchase_orders (restaurant_id, supplier_id, status, ordered_at, total_amount, created_by)
         VALUES ($1,$2,'sent',now(),$3,$4) RETURNING *`,
        [req.scopedRestaurantId, supplier_id || null, totalAmount, req.user?.id]
      );
      const po = poRes.rows[0];

      for (const item of items) {
        await client.query(
          `INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_price)
           VALUES ($1,$2,$3,$4)`,
          [po.id, item.ingredient_id, item.quantity, item.unit_price]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(po);
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // PATCH /api/v1/restaurant/purchase-orders/:id/receive — réception, incrémente le stock
  router.patch('/purchase-orders/:id/receive', restaurantScope, async (req, res) => {
    try {
      const owns = await pool.query(
        'SELECT id FROM purchase_orders WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Commande d\'achat introuvable' });

      const updated = await stockService.receivePurchaseOrder(pool, req.params.id, { userId: req.user?.id });
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // ---------- Fournisseurs (table créée vide en Lot 1) ----------

  router.get('/suppliers', restaurantScope, async (req, res) => {
    const result = await pool.query(
      'SELECT * FROM suppliers WHERE restaurant_id = $1 ORDER BY name',
      [req.scopedRestaurantId]
    );
    res.json({ data: result.rows });
  });

  router.post('/suppliers', restaurantScope, async (req, res) => {
    try {
      const { name, contact_phone, contact_email, payment_terms } = req.body;
      if (!name) return res.status(400).json({ error: 'name requis' });
      const result = await pool.query(
        `INSERT INTO suppliers (restaurant_id, name, contact_phone, contact_email, payment_terms)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.scopedRestaurantId, name, contact_phone || null, contact_email || null, payment_terms || null]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
