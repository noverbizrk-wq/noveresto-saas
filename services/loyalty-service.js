// loyalty-service.js
//
// Fondation du programme de fidélité (Phase A). Points en grand-livre
// (ledger), même principe que stock_movements/inventory_counts — le
// solde est toujours SUM(points_delta), jamais un champ mutable qui
// pourrait se désynchroniser.
//
// Règle d'acquisition : 1 point par unité de devise dépensée (1 TND = 1pt),
// crédité automatiquement quand une commande passe à 'completed' — voir
// l'intégration dans orders-service.changeOrderStatus.

const TIERS = [
  { key: 'decouvreur', name: 'Découvreur', icon: '🥉', min: 0,   max: 199 },
  { key: 'habitue',    name: 'Habitué',    icon: '🥈', min: 200, max: 499 },
  { key: 'vip',        name: 'VIP',        icon: '🥇', min: 500, max: Infinity },
];

function getTier(points) {
  return TIERS.find(t => points >= t.min && points <= t.max) || TIERS[0];
}

/**
 * Retrouve un client existant par téléphone (par restaurant), ou le crée.
 * Le téléphone est l'identifiant naturel côté staff (pas d'app client final).
 */
async function findOrCreateCustomer(pool, restaurantId, phone, name) {
  const normalizedPhone = String(phone).trim();
  const existing = await pool.query(
    'SELECT * FROM customers WHERE restaurant_id = $1 AND phone = $2',
    [restaurantId, normalizedPhone]
  );
  if (existing.rows.length > 0) {
    if (name && !existing.rows[0].name) {
      await pool.query('UPDATE customers SET name = $1 WHERE id = $2', [name, existing.rows[0].id]);
      existing.rows[0].name = name;
    }
    return existing.rows[0];
  }
  const created = await pool.query(
    'INSERT INTO customers (restaurant_id, phone, name) VALUES ($1,$2,$3) RETURNING *',
    [restaurantId, normalizedPhone, name || null]
  );
  return created.rows[0];
}

/**
 * Crédite les points d'une commande terminée. Best-effort comme
 * deductStockForOrder — n'échoue jamais la mise à jour de statut.
 */
async function awardPointsForOrder(pool, orderId, restaurantId, customerId, grossAmount) {
  if (!customerId) return null;
  try {
    const points = Math.floor(Number(grossAmount));
    if (points <= 0) return null;
    const result = await pool.query(
      `INSERT INTO loyalty_points_ledger (customer_id, restaurant_id, points_delta, reason, reference_type, reference_id)
       VALUES ($1,$2,$3,'order_completed','order',$4) RETURNING *`,
      [customerId, restaurantId, points, orderId]
    );
    return result.rows[0];
  } catch (err) {
    console.error('[loyalty-service] échec crédit points (commande non bloquée):', err.message);
    return null;
  }
}

async function getCustomerBalance(pool, customerId) {
  const result = await pool.query(
    'SELECT COALESCE(SUM(points_delta),0) AS balance FROM loyalty_points_ledger WHERE customer_id = $1',
    [customerId]
  );
  return Number(result.rows[0].balance);
}

async function listCustomers(pool, restaurantId) {
  const result = await pool.query(
    `SELECT c.id, c.phone, c.name, c.birthday, c.created_at,
            COALESCE(pts.total, 0) AS points,
            COALESCE(ord.cnt, 0) AS orders_count,
            ord.last_order_at
     FROM customers c
     LEFT JOIN (
       SELECT customer_id, SUM(points_delta) AS total
       FROM loyalty_points_ledger
       GROUP BY customer_id
     ) pts ON pts.customer_id = c.id
     LEFT JOIN (
       SELECT customer_id, COUNT(*) AS cnt, MAX(received_at) AS last_order_at
       FROM orders
       WHERE status = 'completed'
       GROUP BY customer_id
     ) ord ON ord.customer_id = c.id
     WHERE c.restaurant_id = $1
     ORDER BY points DESC`,
    [restaurantId]
  );
  return result.rows.map(r => ({
    id: r.id,
    phone: r.phone,
    name: r.name,
    birthday: r.birthday,
    points: Number(r.points),
    tier: getTier(Number(r.points)),
    orders_count: Number(r.orders_count),
    last_order_at: r.last_order_at
  }));
}

async function getStats(pool, restaurantId) {
  const customers = await listCustomers(pool, restaurantId);
  const byTier = { decouvreur: 0, habitue: 0, vip: 0 };
  customers.forEach(c => { byTier[c.tier.key]++; });

  const withOrders = customers.filter(c => c.orders_count > 0);
  const returning = withOrders.filter(c => c.orders_count >= 2);
  const returnRatePct = withOrders.length > 0 ? Math.round((returning.length / withOrders.length) * 100) : 0;

  const avgSpendRes = await pool.query(
    `SELECT AVG(gross_amount) AS avg_spend FROM orders
     WHERE restaurant_id = $1 AND customer_id IS NOT NULL AND status = 'completed'`,
    [restaurantId]
  );
  const avgLoyalSpend = avgSpendRes.rows[0].avg_spend ? Math.round(Number(avgSpendRes.rows[0].avg_spend)) : 0;

  return {
    total_customers: customers.length,
    vip_customers: byTier.vip,
    return_rate_pct: returnRatePct,
    avg_loyal_spend: avgLoyalSpend,
    tiers: TIERS.map(t => ({ key: t.key, name: t.name, icon: t.icon, min: t.min, max: t.max === Infinity ? null : t.max, count: byTier[t.key] }))
  };
}

module.exports = { findOrCreateCustomer, awardPointsForOrder, getCustomerBalance, listCustomers, getStats, getTier, TIERS };
