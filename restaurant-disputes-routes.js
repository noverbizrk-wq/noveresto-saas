// restaurant-disputes-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-2.

const express = require('express');
const router = express.Router();
const disputesService = require('./services/disputes-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const disputesAccess = require('./middleware/module-access-middleware')(pool, 'disputes');

  // GET /api/v1/restaurant/disputes?status=
  router.get('/disputes', restaurantScope, disputesAccess, async (req, res) => {
    const { status } = req.query;
    const conditions = ['d.restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    if (status) { conditions.push('d.status = $2'); params.push(status); }

    const result = await pool.query(
      `SELECT d.*, u.name AS assigned_to_name
       FROM disputes d
       LEFT JOIN users u ON u.id = d.assigned_to
       WHERE ${conditions.join(' AND ')}
       ORDER BY d.created_at DESC`,
      params
    );
    res.json({ data: result.rows });
  });

  router.get('/disputes/summary', restaurantScope, disputesAccess, async (req, res) => {
    const summary = await disputesService.getDisputesSummary(pool, req.scopedRestaurantId);
    res.json(summary);
  });

  router.get('/disputes/:id', restaurantScope, disputesAccess, async (req, res) => {
    const dispute = await pool.query(
      'SELECT * FROM disputes WHERE id = $1 AND restaurant_id = $2',
      [req.params.id, req.scopedRestaurantId]
    );
    if (dispute.rows.length === 0) return res.status(404).json({ error: 'Litige introuvable' });

    const evidence = await pool.query(
      'SELECT * FROM dispute_evidence WHERE dispute_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    const history = await pool.query(
      'SELECT * FROM dispute_status_history WHERE dispute_id = $1 ORDER BY changed_at',
      [req.params.id]
    );
    res.json({ ...dispute.rows[0], evidence: evidence.rows, history: history.rows });
  });

  router.post('/disputes', restaurantScope, disputesAccess, async (req, res) => {
    try {
      const { order_id, review_id, platform, reason, amount_requested, due_date } = req.body;
      if (!reason) return res.status(400).json({ error: 'reason requis' });

      const result = await pool.query(
        `INSERT INTO disputes
          (restaurant_id, order_id, review_id, platform, reason, amount_requested, due_date, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [req.scopedRestaurantId, order_id || null, review_id || null, platform || null,
         reason, amount_requested || 0, due_date || null, req.user?.id]
      );

      await pool.query(
        `INSERT INTO dispute_status_history (dispute_id, from_status, to_status, changed_by)
         VALUES ($1, NULL, 'to_analyze', $2)`,
        [result.rows[0].id, req.user?.id]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/disputes/:id/status  { status, amount_refunded? }
  router.patch('/disputes/:id/status', restaurantScope, disputesAccess, async (req, res) => {
    try {
      const { status, amount_refunded } = req.body;
      if (!status) return res.status(400).json({ error: 'status requis' });

      const check = await pool.query(
        'SELECT id FROM disputes WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (check.rows.length === 0) return res.status(404).json({ error: 'Litige introuvable' });

      const updated = await disputesService.changeDisputeStatus(pool, req.params.id, status, {
        changedBy: req.user?.id,
        restaurantId: req.scopedRestaurantId,
        amountRefunded: amount_refunded
      });
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/disputes/:id/evidence  { photo_url, note }
  router.post('/disputes/:id/evidence', restaurantScope, disputesAccess, async (req, res) => {
    try {
      const { photo_url, note } = req.body;
      if (!photo_url) return res.status(400).json({ error: 'photo_url requis' });

      const owns = await pool.query(
        'SELECT id FROM disputes WHERE id = $1 AND restaurant_id = $2',
        [req.params.id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Litige introuvable' });

      const result = await pool.query(
        `INSERT INTO dispute_evidence (dispute_id, photo_url, note, created_by)
         VALUES ($1,$2,$3,$4) RETURNING *`,
        [req.params.id, photo_url, note || null, req.user?.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
