// restaurant-orders-routes.js (révisé post-audit)
// Monté sur /api/v1/restaurant/* dans server.js.
//
// IMPORTANT — ordre des middlewares : authMiddleware doit tourner AVANT
// restaurantScopeMiddleware (le scope a besoin de req.user posé par l'auth).
// Voir INTEGRATION.md pour le montage exact dans server.js.

const express = require('express');
const router = express.Router();
const ordersService = require('./services/orders-service');
const { logAction } = require('./services/audit-log-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // ---------- Commandes ----------

  // GET /api/v1/restaurant/orders?restaurant_id=&status=&channel_id=&page=&limit=
  router.get('/orders', restaurantScope, async (req, res) => {
    try {
      const { status, channel_id, page = 1, limit = 50 } = req.query;
      const restaurantId = req.scopedRestaurantId;

      const conditions = ['o.restaurant_id = $1'];
      const params = [restaurantId];
      let idx = 2;

      if (status) { conditions.push(`o.status = $${idx++}`); params.push(status); }
      if (channel_id) { conditions.push(`o.channel_id = $${idx++}`); params.push(channel_id); }

      const offset = (Number(page) - 1) * Number(limit);
      params.push(Number(limit), offset);

      const result = await pool.query(
        `SELECT o.*, sc.label AS channel_label, dp.label AS platform_label
         FROM orders o
         JOIN sales_channels sc ON sc.id = o.channel_id
         LEFT JOIN delivery_platforms dp ON dp.id = o.delivery_platform_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.received_at DESC
         LIMIT $${idx++} OFFSET $${idx}`,
        params
      );
      res.json({ data: result.rows, page: Number(page), limit: Number(limit) });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/orders/:id?restaurant_id=
  // Note : restaurant_id doit être fourni en query pour que restaurantScope
  // vérifie les droits AVANT de révéler le contenu de la commande.
  router.get('/orders/:id', restaurantScope, async (req, res) => {
    try {
      const order = await pool.query(
        'SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (order.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable' });

      const items = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [req.params.id]);
      const history = await pool.query(
        'SELECT * FROM order_status_history WHERE order_id = $1 ORDER BY changed_at ASC',
        [req.params.id]
      );
      res.json({ ...order.rows[0], items: items.rows, history: history.rows });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/orders  (restaurant_id dans le body)
  router.post('/orders', restaurantScope, async (req, res) => {
    try {
      if (!req.body.items || req.body.items.length === 0) {
        return res.status(400).json({ error: 'La commande doit contenir au moins un article' });
      }
      const order = await ordersService.createOrder(pool, {
        ...req.body,
        restaurant_id: req.scopedRestaurantId,
        created_by: req.user?.id
      });
      res.status(201).json(order);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/orders/:id/status  { restaurant_id, status, reason }
  router.patch('/orders/:id/status', restaurantScope, async (req, res) => {
    try {
      const { status, reason } = req.body;
      if (!status) return res.status(400).json({ error: 'status requis' });

      // Vérifier que la commande appartient bien au restaurant scopé
      const check = await pool.query(
        'SELECT id FROM orders WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'Commande introuvable' });

      const updated = await ordersService.changeOrderStatus(pool, req.params.id, status, {
        changedBy: req.user?.id,
        reason,
        restaurantId: req.scopedRestaurantId
      });
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // ---------- KDS ----------

  router.get('/kds/queue', restaurantScope, async (req, res) => {
    try {
      const queue = await ordersService.getKdsQueue(pool, req.scopedRestaurantId);
      res.json({ data: queue });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // ---------- Dashboard ----------

  router.get('/dashboard/summary', restaurantScope, async (req, res) => {
    try {
      const { from, to } = req.query;
      if (!from || !to) return res.status(400).json({ error: 'from et to requis' });
      const summary = await ordersService.getDashboardSummary(pool, req.scopedRestaurantId, { from, to });
      res.json({ data: summary });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // ---------- Référentiels (non scopés — données globales) ----------

  router.get('/channels', async (req, res) => {
    const result = await pool.query('SELECT * FROM sales_channels WHERE is_active = true ORDER BY id');
    res.json({ data: result.rows });
  });

  router.get('/delivery-platforms', async (req, res) => {
    const result = await pool.query('SELECT * FROM delivery_platforms ORDER BY id');
    res.json({ data: result.rows });
  });

  // ---------- Contexte restaurant courant (corrige le restaurant_id:1 en dur côté front) ----------

  // GET /api/v1/restaurant/context
  // Retourne le(s) restaurant(s) de l'utilisateur connecté. Convention réelle
  // du projet : un "restaurant" = un compte utilisateur (users.id). Un admin
  // voit la liste de tous les comptes non-admin (= tous les restaurants) pour
  // alimenter le sélecteur frontend.
  router.get('/context', async (req, res) => {
    try {
      if (req.user?.role === 'admin') {
        const result = await pool.query(
          `SELECT id, name, restaurant AS restaurant_name, country
           FROM users WHERE role != 'admin' ORDER BY id`
        );
        return res.json({
          data: result.rows.map(r => ({
            id: r.id,
            name: r.restaurant_name || r.name,
            currency: 'TND',
            timezone: 'Africa/Tunis'
          }))
        });
      }
      // Compte standard : son propre "restaurant" = ses propres infos JWT,
      // pas besoin de requête DB supplémentaire.
      res.json({
        data: [{
          id: req.user.id,
          name: req.user.restaurant || req.user.name,
          currency: 'TND',
          timezone: 'Africa/Tunis'
        }]
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
