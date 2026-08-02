// orders-service.js (révisé post-audit)
// Changements vs v1 : menu_item_id/item_name (au lieu de product_*),
// écriture réelle dans audit_log à chaque changement de statut sensible
// (cf. audit §1.12 : la table social_audit_log existante n'était jamais
// écrite — ce module corrige ce pattern pour son propre domaine).

const { logAction } = require('./audit-log-service');
const { deductStockForOrder } = require('./stock-service');

const VALID_STATUSES = [
  'new', 'to_validate', 'accepted', 'in_preparation', 'ready',
  'awaiting_courier', 'handed_off', 'delivered', 'completed',
  'cancelled', 'refunded', 'disputed'
];

const ALLOWED_TRANSITIONS = {
  new: ['to_validate', 'accepted', 'cancelled'],
  to_validate: ['accepted', 'cancelled'],
  accepted: ['in_preparation', 'cancelled'],
  in_preparation: ['ready', 'cancelled'],
  ready: ['awaiting_courier', 'handed_off', 'completed'],
  awaiting_courier: ['handed_off', 'cancelled'],
  handed_off: ['delivered', 'disputed'],
  delivered: ['completed', 'disputed'],
  completed: ['refunded', 'disputed'],
  cancelled: [],
  refunded: [],
  disputed: ['refunded', 'completed']
};

const AUDITED_STATUSES = new Set(['cancelled', 'refunded', 'disputed']);

function assertValidStatus(status) {
  if (!VALID_STATUSES.includes(status)) {
    const err = new Error(`Statut invalide: ${status}`);
    err.statusCode = 400;
    throw err;
  }
}

function assertTransitionAllowed(from, to) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Transition non autorisée: ${from} -> ${to}`);
    err.statusCode = 409;
    throw err;
  }
}

async function createOrder(pool, payload) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const grossAmount = payload.items.reduce(
      (sum, it) => sum + Number(it.unit_price) * Number(it.quantity), 0
    );

    const orderRes = await client.query(
      `INSERT INTO orders
        (restaurant_id, channel_id, delivery_platform_id, external_order_ref,
         status, promised_at, gross_amount, discount_amount, commission_amount,
         payment_method, customer_note, allergen_flags, created_by)
       VALUES ($1,$2,$3,$4,'new',$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [
        payload.restaurant_id, payload.channel_id, payload.delivery_platform_id || null,
        payload.external_order_ref || null, payload.promised_at || null,
        grossAmount, payload.discount_amount || 0, payload.commission_amount || 0,
        payload.payment_method || null, payload.customer_note || null,
        payload.allergen_flags || null, payload.created_by || null
      ]
    );
    const order = orderRes.rows[0];

    for (const item of payload.items) {
      await client.query(
        `INSERT INTO order_items
          (order_id, menu_item_id, item_name, quantity, unit_price, modifiers, station)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          order.id, item.menu_item_id, item.item_name, item.quantity,
          item.unit_price, JSON.stringify(item.modifiers || []), item.station || null
        ]
      );
    }

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1, NULL, 'new', $2, 'Création commande')`,
      [order.id, payload.created_by || null]
    );

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function changeOrderStatus(pool, orderId, toStatus, { changedBy, reason, restaurantId } = {}) {
  assertValidStatus(toStatus);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query('SELECT status, restaurant_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (current.rows.length === 0) {
      const err = new Error('Commande introuvable');
      err.statusCode = 404;
      throw err;
    }
    const fromStatus = current.rows[0].status;
    assertTransitionAllowed(fromStatus, toStatus);

    const updated = await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [toStatus, orderId]
    );

    await client.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
       VALUES ($1,$2,$3,$4,$5)`,
      [orderId, fromStatus, toStatus, changedBy || null, reason || null]
    );

    await client.query('COMMIT');

    // Point d'accroche prévu en Lot 1 : déduction de stock selon les fiches
    // techniques (Lot 2). Best-effort — n'échoue jamais la mise à jour de statut.
    if (toStatus === 'completed') {
      await deductStockForOrder(pool, orderId, {
        restaurantId: restaurantId || current.rows[0].restaurant_id,
        userId: changedBy
      });
    }

    if (AUDITED_STATUSES.has(toStatus)) {
      await logAction(pool, {
        restaurantId: restaurantId || current.rows[0].restaurant_id,
        userId: changedBy,
        action: `order.status.${toStatus}`,
        entityType: 'order',
        entityId: orderId,
        details: { from: fromStatus, to: toStatus, reason }
      });
    }

    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getKdsQueue(pool, restaurantId) {
  const res = await pool.query(
    `SELECT o.id, o.status, o.received_at, o.promised_at,
            EXTRACT(EPOCH FROM (now() - o.received_at))::int AS seconds_elapsed,
            CASE WHEN o.promised_at IS NOT NULL AND now() > o.promised_at THEN true ELSE false END AS is_late,
            json_agg(json_build_object(
              'id', oi.id, 'item_name', oi.item_name, 'quantity', oi.quantity,
              'modifiers', oi.modifiers, 'station', oi.station, 'is_cancelled', oi.is_cancelled
            )) AS items
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE o.restaurant_id = $1
       AND o.status IN ('accepted','in_preparation','ready')
     GROUP BY o.id
     ORDER BY is_late DESC, o.received_at ASC`,
    [restaurantId]
  );
  return res.rows;
}

async function getDashboardSummary(pool, restaurantId, { from, to }) {
  const res = await pool.query(
    `SELECT
       COALESCE(SUM(gross_amount),0)::numeric AS gross_revenue,
       COALESCE(SUM(net_amount),0)::numeric AS net_revenue,
       COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) AS order_count,
       COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled_count,
       COALESCE(AVG(gross_amount) FILTER (WHERE status NOT IN ('cancelled')),0)::numeric AS avg_ticket,
       sc.label AS channel_label,
       COALESCE(SUM(gross_amount),0)::numeric AS channel_revenue
     FROM orders o
     JOIN sales_channels sc ON sc.id = o.channel_id
     WHERE o.restaurant_id = $1 AND o.received_at BETWEEN $2 AND $3
     GROUP BY GROUPING SETS ((), (sc.label))`,
    [restaurantId, from, to]
  );
  return res.rows;
}

module.exports = {
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  createOrder,
  changeOrderStatus,
  getKdsQueue,
  getDashboardSummary
};
