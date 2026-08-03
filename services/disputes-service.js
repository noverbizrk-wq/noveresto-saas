// disputes-service.js
// Gère le cycle de vie d'un litige : transitions de statut validées,
// historique automatique, calcul de l'écart non récupéré.

const { logAction } = require('./audit-log-service');

const VALID_STATUSES = [
  'to_analyze', 'evidence_needed', 'contest_prepared', 'sent', 'pending',
  'accepted', 'partially_accepted', 'refused', 'refunded', 'closed'
];

const ALLOWED_TRANSITIONS = {
  to_analyze: ['evidence_needed', 'contest_prepared', 'closed'],
  evidence_needed: ['contest_prepared', 'closed'],
  contest_prepared: ['sent', 'closed'],
  sent: ['pending', 'closed'],
  pending: ['accepted', 'partially_accepted', 'refused', 'closed'],
  accepted: ['refunded'],
  partially_accepted: ['refunded'],
  refused: ['closed'],
  refunded: ['closed'],
  closed: []
};

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

async function changeDisputeStatus(pool, disputeId, toStatus, { changedBy, restaurantId, amountRefunded } = {}) {
  assertValidStatus(toStatus);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const current = await client.query(
      'SELECT status, restaurant_id, amount_requested FROM disputes WHERE id = $1 FOR UPDATE',
      [disputeId]
    );
    if (current.rows.length === 0) {
      const err = new Error('Litige introuvable');
      err.statusCode = 404;
      throw err;
    }
    const fromStatus = current.rows[0].status;
    assertTransitionAllowed(fromStatus, toStatus);

    const updateFields = ['status = $1'];
    const params = [toStatus];
    let idx = 2;
    if (toStatus === 'refunded' && amountRefunded !== undefined) {
      updateFields.push(`amount_refunded = $${idx++}`);
      params.push(amountRefunded);
    }
    params.push(disputeId);

    const updated = await client.query(
      `UPDATE disputes SET ${updateFields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params
    );

    await client.query(
      `INSERT INTO dispute_status_history (dispute_id, from_status, to_status, changed_by)
       VALUES ($1,$2,$3,$4)`,
      [disputeId, fromStatus, toStatus, changedBy || null]
    );

    await client.query('COMMIT');

    await logAction(pool, {
      restaurantId: restaurantId || current.rows[0].restaurant_id,
      userId: changedBy,
      action: `dispute.status.${toStatus}`,
      entityType: 'dispute',
      entityId: disputeId,
      details: { from: fromStatus, to: toStatus }
    });

    return updated.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Vue synthétique des litiges avec l'écart non récupéré
 * (amount_requested - amount_refunded), utile pour le rapprochement financier.
 */
async function getDisputesSummary(pool, restaurantId) {
  const result = await pool.query(
    `SELECT
       COUNT(*) AS total_disputes,
       COUNT(*) FILTER (WHERE status NOT IN ('closed','refunded')) AS open_disputes,
       COALESCE(SUM(amount_requested),0)::numeric AS total_requested,
       COALESCE(SUM(amount_refunded),0)::numeric AS total_refunded,
       COALESCE(SUM(amount_requested - amount_refunded) FILTER (WHERE status IN ('refunded','closed')),0)::numeric AS total_gap
     FROM disputes
     WHERE restaurant_id = $1`,
    [restaurantId]
  );
  return result.rows[0];
}

module.exports = {
  VALID_STATUSES,
  ALLOWED_TRANSITIONS,
  changeDisputeStatus,
  getDisputesSummary
};
