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

/**
 * Fiche client detaillee : infos + historique commandes + grand-livre
 * complet des points (pas juste le solde). Verifie que le client
 * appartient bien au restaurant scope (IDOR).
 */
async function getCustomerDetail(pool, restaurantId, customerId) {
  const customerRes = await pool.query(
    'SELECT * FROM customers WHERE id = $1 AND restaurant_id = $2',
    [customerId, restaurantId]
  );
  if (customerRes.rows.length === 0) {
    const err = new Error('Client introuvable');
    err.statusCode = 404;
    throw err;
  }
  const customer = customerRes.rows[0];

  const ordersRes = await pool.query(
    `SELECT id, status, received_at, gross_amount, payment_method
     FROM orders
     WHERE customer_id = $1 AND restaurant_id = $2
     ORDER BY received_at DESC`,
    [customerId, restaurantId]
  );

  const ledgerRes = await pool.query(
    `SELECT id, points_delta, reason, reference_type, reference_id, note, created_at
     FROM loyalty_points_ledger
     WHERE customer_id = $1 AND restaurant_id = $2
     ORDER BY created_at DESC`,
    [customerId, restaurantId]
  );

  const balance = ledgerRes.rows.reduce((sum, r) => sum + Number(r.points_delta), 0);

  return {
    id: customer.id,
    phone: customer.phone,
    name: customer.name,
    birthday: customer.birthday,
    notes: customer.notes,
    created_at: customer.created_at,
    points: balance,
    tier: getTier(balance),
    orders: ordersRes.rows,
    points_ledger: ledgerRes.rows
  };
}

async function updateCustomerNotes(pool, restaurantId, customerId, notes) {
  const result = await pool.query(
    'UPDATE customers SET notes = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *',
    [notes || null, customerId, restaurantId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Client introuvable');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

/**
 * Suppression physique d'un client fidelite. Sure : loyalty_points_ledger
 * est en ON DELETE CASCADE (verifie migration 019), orders.customer_id
 * repasse a NULL proprement (ON DELETE SET NULL) — aucune commande n'est
 * supprimee, seul le rattachement au client disparait.
 */
async function deleteCustomer(pool, restaurantId, customerId) {
  const result = await pool.query(
    'DELETE FROM customers WHERE id = $1 AND restaurant_id = $2 RETURNING id',
    [customerId, restaurantId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Client introuvable');
    err.statusCode = 404;
    throw err;
  }
  return true;
}

/**
 * Ajout manuel d'un client, sans passer par une commande (constitution de
 * la base clients). Telephone unique par restaurant (meme contrainte que
 * findOrCreateCustomer / la table customers).
 */
async function createCustomer(pool, restaurantId, { phone, name, birthday }) {
  if (!phone || !String(phone).trim()) {
    const err = new Error('Le telephone est requis');
    err.statusCode = 400;
    throw err;
  }
  const normalizedPhone = String(phone).trim();
  const existing = await pool.query(
    'SELECT id FROM customers WHERE restaurant_id = $1 AND phone = $2',
    [restaurantId, normalizedPhone]
  );
  if (existing.rows.length > 0) {
    const err = new Error('Un client avec ce telephone existe deja');
    err.statusCode = 409;
    throw err;
  }
  const result = await pool.query(
    'INSERT INTO customers (restaurant_id, phone, name, birthday) VALUES ($1,$2,$3,$4) RETURNING *',
    [restaurantId, normalizedPhone, name || null, birthday || null]
  );
  return result.rows[0];
}

/**
 * Import CSV en masse (telephone, nom, date de naissance). Le CSV est
 * parse cote client (meme convention que /api/v1/import/csv) — cette
 * fonction recoit un tableau de lignes deja normalisees.
 * Best-effort ligne par ligne : un telephone invalide ou en double
 * n'interrompt pas l'import du reste du fichier.
 */
async function importCustomersCsv(pool, restaurantId, rows) {
  let inserted = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const phone = row.phone ? String(row.phone).trim() : '';
    if (!phone) {
      skipped++;
      errors.push(`Ligne ${i + 1}: telephone manquant`);
      continue;
    }
    try {
      const existing = await pool.query(
        'SELECT id FROM customers WHERE restaurant_id = $1 AND phone = $2',
        [restaurantId, phone]
      );
      if (existing.rows.length > 0) {
        skipped++;
        errors.push(`Ligne ${i + 1}: telephone ${phone} deja existant`);
        continue;
      }
      await pool.query(
        'INSERT INTO customers (restaurant_id, phone, name, birthday) VALUES ($1,$2,$3,$4)',
        [restaurantId, phone, row.name || null, row.birthday || null]
      );
      inserted++;
    } catch (err) {
      skipped++;
      errors.push(`Ligne ${i + 1}: ${err.message}`);
    }
  }

  return { inserted, skipped, errors };
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

module.exports = {
  findOrCreateCustomer, awardPointsForOrder, getCustomerBalance, listCustomers, getStats, getTier, TIERS,
  getCustomerDetail, updateCustomerNotes, deleteCustomer, createCustomer, importCustomersCsv
};
