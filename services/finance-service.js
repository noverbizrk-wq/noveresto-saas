// finance-service.js
// Rapports financiers : ventilation par taux de TVA, par canal, export CSV.
//
// Hypothèse assumée (à documenter/valider avec un comptable, cf. règle du
// cahier des charges §13.4 : "Tous les calculs fiscaux doivent être
// configurables selon le pays et validés par un professionnel") :
// order_items.unit_price est TTC (convention point de vente courante en
// Tunisie). Le calcul HT/TVA en découle : HT = TTC / (1 + taux/100).

async function getVatBreakdown(pool, restaurantId, from, to) {
  const result = await pool.query(
    `SELECT
       oi.vat_rate,
       ROUND(COALESCE(SUM(oi.unit_price * oi.quantity), 0)::numeric, 3) AS revenue_ttc,
       ROUND(COALESCE(SUM(oi.unit_price * oi.quantity / (1 + oi.vat_rate / 100.0)), 0)::numeric, 3) AS revenue_ht,
       ROUND(COALESCE(SUM(oi.unit_price * oi.quantity) - SUM(oi.unit_price * oi.quantity / (1 + oi.vat_rate / 100.0)), 0)::numeric, 3) AS vat_amount
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.restaurant_id = $1
       AND o.received_at BETWEEN $2 AND $3
       AND oi.is_cancelled = false
       AND o.status != 'cancelled'
     GROUP BY oi.vat_rate
     ORDER BY oi.vat_rate`,
    [restaurantId, from, to]
  );
  return result.rows;
}

async function getChannelBreakdown(pool, restaurantId, from, to) {
  const result = await pool.query(
    `SELECT
       sc.label AS channel_label,
       COUNT(*) AS order_count,
       COALESCE(SUM(o.gross_amount), 0)::numeric AS gross,
       COALESCE(SUM(o.discount_amount), 0)::numeric AS discounts,
       COALESCE(SUM(o.commission_amount), 0)::numeric AS commissions,
       COALESCE(SUM(o.net_amount), 0)::numeric AS net
     FROM orders o
     JOIN sales_channels sc ON sc.id = o.channel_id
     WHERE o.restaurant_id = $1
       AND o.received_at BETWEEN $2 AND $3
       AND o.status != 'cancelled'
     GROUP BY sc.label
     ORDER BY net DESC`,
    [restaurantId, from, to]
  );
  return result.rows;
}

/**
 * Génère un export CSV des commandes de la période (pour transmission
 * comptable, cf. §13.4). Encodage UTF-8 avec BOM pour compatibilité Excel
 * (convention déjà utilisée côté NoverProspect selon le contexte projet).
 */
async function generateOrdersCsv(pool, restaurantId, from, to) {
  const result = await pool.query(
    `SELECT o.id, o.received_at, sc.label AS channel, o.status,
            o.gross_amount, o.discount_amount, o.commission_amount, o.net_amount,
            o.payment_method
     FROM orders o
     JOIN sales_channels sc ON sc.id = o.channel_id
     WHERE o.restaurant_id = $1 AND o.received_at BETWEEN $2 AND $3
     ORDER BY o.received_at`,
    [restaurantId, from, to]
  );

  const header = 'ID,Date,Canal,Statut,Montant Brut,Remise,Commission,Montant Net,Paiement';
  const rows = result.rows.map(r => [
    r.id,
    new Date(r.received_at).toISOString(),
    r.channel,
    r.status,
    Number(r.gross_amount).toFixed(3),
    Number(r.discount_amount).toFixed(3),
    Number(r.commission_amount).toFixed(3),
    Number(r.net_amount).toFixed(3),
    r.payment_method || ''
  ].join(','));

  return '\uFEFF' + [header, ...rows].join('\n');
}

module.exports = { getVatBreakdown, getChannelBreakdown, generateOrdersCsv };
