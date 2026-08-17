// restaurant-social-profile-routes.js
//
// Fournit au module Social Media IA les vraies donnees du restaurant, au
// lieu de l'objet code en dur ("Restauration rapide halal", top_dishes
// fixes sur des burgers) qui existait auparavant cote frontend pour TOUS
// les restaurants quel que soit leur type de cuisine reel.
//
// top_dishes et avg_ticket sont calcules a la volee depuis les vraies
// ventes — toujours a jour, aucun champ a resaisir manuellement.

const express = require('express');
const router = express.Router();

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // GET /api/v1/restaurant/social-profile
  router.get('/social-profile', restaurantScope, async (req, res) => {
    try {
      const userRes = await pool.query(
        'SELECT restaurant, country, cuisine_type FROM users WHERE id = $1',
        [req.scopedRestaurantId]
      );
      const u = userRes.rows[0] || {};

      const topDishesRes = await pool.query(
        `SELECT mi.name, SUM(oi.quantity) AS qty_sold
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.restaurant_id = $1 AND oi.is_cancelled = false
           AND o.received_at >= now() - INTERVAL '90 days'
         GROUP BY mi.id, mi.name
         ORDER BY qty_sold DESC
         LIMIT 3`,
        [req.scopedRestaurantId]
      );
      const topDishes = topDishesRes.rows.map(r => r.name);

      const ticketRes = await pool.query(
        `SELECT AVG(gross_amount) AS avg_ticket
         FROM orders
         WHERE restaurant_id = $1 AND received_at >= now() - INTERVAL '30 days'`,
        [req.scopedRestaurantId]
      );
      const avgTicket = ticketRes.rows[0].avg_ticket ? Math.round(Number(ticketRes.rows[0].avg_ticket)) : null;

      res.json({
        name: u.restaurant,
        cuisine_type: u.cuisine_type || null,
        country: u.country,
        top_dishes: topDishes,
        avg_ticket: avgTicket,
        has_enough_data: topDishes.length > 0 && avgTicket !== null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
