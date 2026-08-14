// admin-overview-routes.js
//
// Vue d'ensemble SaaS pour l'admin : CA du jour agrégé + détail par
// restaurant avec alertes (stock faible, litiges ouverts, suggestions
// d'achat en attente). Permet à l'admin de voir tous les clients d'un
// coup et de savoir où intervenir, plutôt que de voir les données d'un
// seul restaurant à la fois (l'admin n'est lui-même pas un restaurant).
//
// authMiddleware + adminOnly déjà appliqués au montage dans server.js.

const express = require('express');
const router = express.Router();

module.exports = function (pool) {

  // GET /api/v1/admin/overview
  router.get('/overview', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          u.id, u.restaurant AS name, u.country, u.created_at,
          COALESCE(today.revenue, 0) AS revenue_today,
          COALESCE(today.orders_count, 0) AS orders_today,
          COALESCE(low_stock.cnt, 0) AS low_stock_count,
          COALESCE(disputes.cnt, 0) AS open_disputes_count,
          COALESCE(suggestions.cnt, 0) AS pending_suggestions_count
        FROM users u
        LEFT JOIN (
          SELECT restaurant_id, SUM(gross_amount) AS revenue, COUNT(*) AS orders_count
          FROM orders
          WHERE received_at::date = CURRENT_DATE
          GROUP BY restaurant_id
        ) today ON today.restaurant_id = u.id
        LEFT JOIN (
          SELECT restaurant_id, COUNT(*) AS cnt
          FROM ingredients
          WHERE current_stock <= min_stock AND min_stock > 0
          GROUP BY restaurant_id
        ) low_stock ON low_stock.restaurant_id = u.id
        LEFT JOIN (
          SELECT restaurant_id, COUNT(*) AS cnt
          FROM disputes
          WHERE status IN ('to_analyze', 'evidence_needed', 'contest_prepared', 'sent')
          GROUP BY restaurant_id
        ) disputes ON disputes.restaurant_id = u.id
        LEFT JOIN (
          SELECT restaurant_id, COUNT(*) AS cnt
          FROM purchase_suggestions
          WHERE status = 'pending'
          GROUP BY restaurant_id
        ) suggestions ON suggestions.restaurant_id = u.id
        WHERE u.role = 'client'
        ORDER BY revenue_today DESC NULLS LAST, u.id
      `);

      const restaurants = result.rows.map(r => ({
        id: r.id,
        name: r.name,
        country: r.country,
        revenue_today: Number(r.revenue_today),
        orders_today: Number(r.orders_today),
        low_stock_count: Number(r.low_stock_count),
        open_disputes_count: Number(r.open_disputes_count),
        pending_suggestions_count: Number(r.pending_suggestions_count),
        needs_attention: Number(r.low_stock_count) > 0 || Number(r.open_disputes_count) > 0
      }));

      const totals = restaurants.reduce((acc, r) => ({
        revenue_today: acc.revenue_today + r.revenue_today,
        orders_today: acc.orders_today + r.orders_today,
        low_stock_count: acc.low_stock_count + r.low_stock_count,
        open_disputes_count: acc.open_disputes_count + r.open_disputes_count,
        pending_suggestions_count: acc.pending_suggestions_count + r.pending_suggestions_count,
      }), { revenue_today: 0, orders_today: 0, low_stock_count: 0, open_disputes_count: 0, pending_suggestions_count: 0 });

      res.json({
        restaurants_count: restaurants.length,
        totals,
        restaurants
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
