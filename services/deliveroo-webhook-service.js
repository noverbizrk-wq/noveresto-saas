// deliveroo-webhook-service.js
//
// ⚠️ Construit à partir de la documentation publique Deliveroo
// (api-docs.deliveroo.com), PAS testé contre leur infrastructure réelle
// (aucun accès sandbox depuis mon environnement). Deux choses précises
// restent à valider avec un vrai webhook de test une fois que tu as un
// compte développeur Deliveroo :
//   1. Le format exact de la chaîne signée pour le HMAC (ici : GUID +
//      corps brut de la requête — c'est l'interprétation la plus
//      commune de leur documentation, mais à confirmer).
//   2. Les noms exacts des champs dans le payload JSON (order id,
//      articles, site_id...) — ceux utilisés ici sont des noms
//      plausibles/standards, pas extraits d'un vrai exemple Deliveroo.
// Le webhook enregistre TOUJOURS le payload brut dans
// delivery_webhook_log avant tout traitement, pour ne jamais perdre une
// commande même si le mapping de champs doit être ajusté.

const crypto = require('crypto');

function verifySignature(guid, rawBody, receivedHmac, webhookSecret) {
  if (!guid || !receivedHmac || !webhookSecret) return false;
  const toSign = `${guid}.${rawBody}`;
  const computed = crypto.createHmac('sha256', webhookSecret).update(toSign).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(receivedHmac));
  } catch {
    return false; // longueurs différentes -> jamais un match légitime
  }
}

/**
 * Retrouve le restaurant NoveResto correspondant à un site Deliveroo.
 */
async function findRestaurantConnection(pool, externalSiteId) {
  const result = await pool.query(
    `SELECT rdc.*, dp.code AS platform_code
     FROM restaurant_delivery_connections rdc
     JOIN delivery_platforms dp ON dp.id = rdc.delivery_platform_id
     WHERE dp.code = 'deliveroo' AND rdc.external_site_id = $1`,
    [externalSiteId]
  );
  return result.rows[0] || null;
}

/**
 * Transforme le payload Deliveroo en commande NoveResto. Échoue
 * explicitement (plutôt que de deviner) si un article n'a pas de
 * correspondance enregistrée dans menu_item_external_refs.
 */
async function createOrderFromWebhook(pool, connection, payload) {
  const items = payload.items || payload.order?.items || [];
  if (items.length === 0) {
    const err = new Error('Aucun article dans le payload de commande');
    err.code = 'error_mapping';
    throw err;
  }

  const resolvedItems = [];
  for (const item of items) {
    const externalId = String(item.pos_item_id || item.id || item.menu_item_id || '');
    const refResult = await pool.query(
      `SELECT menu_item_id FROM menu_item_external_refs WHERE delivery_platform_id = $1 AND external_item_id = $2`,
      [connection.delivery_platform_id, externalId]
    );
    if (refResult.rows.length === 0) {
      const err = new Error(`Article Deliveroo sans correspondance interne : "${item.name || externalId}" (id externe: ${externalId}). Configure la correspondance dans Menus avant de retraiter cette commande.`);
      err.code = 'error_mapping';
      throw err;
    }
    resolvedItems.push({
      menu_item_id: refResult.rows[0].menu_item_id,
      item_name: item.name || 'Article Deliveroo',
      quantity: item.quantity || 1,
      unit_price: item.total_price ? Number(item.total_price) / 100 : Number(item.price || 0),
      // Deliveroo exprime généralement les montants en centimes — à
      // confirmer contre un vrai payload.
    });
  }

  const grossAmount = resolvedItems.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const orderResult = await pool.query(
    `INSERT INTO orders (restaurant_id, channel_id, delivery_platform_id, external_order_ref, status, gross_amount, commission_amount)
     VALUES ($1, (SELECT id FROM sales_channels WHERE code = 'delivery_platform'), $2, $3, 'new', $4, $5)
     RETURNING id`,
    [
      connection.restaurant_id,
      connection.delivery_platform_id,
      payload.id || payload.order_id || null,
      grossAmount,
      grossAmount * 0.30, // taux de commission indicatif — à remplacer par le vrai taux négocié
    ]
  );
  const orderId = orderResult.rows[0].id;

  for (const item of resolvedItems) {
    await pool.query(
      `INSERT INTO order_items (order_id, menu_item_id, item_name, quantity, unit_price) VALUES ($1,$2,$3,$4,$5)`,
      [orderId, item.menu_item_id, item.item_name, item.quantity, item.unit_price]
    );
  }

  await pool.query(`UPDATE restaurant_delivery_connections SET last_order_at = now() WHERE id = $1`, [connection.id]);

  return orderId;
}

async function logWebhook(pool, { deliveryPlatformId, restaurantId, eventType, rawPayload, signatureValid, status, errorMessage, orderId }) {
  await pool.query(
    `INSERT INTO delivery_webhook_log (delivery_platform_id, restaurant_id, event_type, raw_payload, signature_valid, processing_status, error_message, order_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [deliveryPlatformId, restaurantId, eventType || null, JSON.stringify(rawPayload), signatureValid, status, errorMessage || null, orderId || null]
  );
}

module.exports = { verifySignature, findRestaurantConnection, createOrderFromWebhook, logWebhook };
