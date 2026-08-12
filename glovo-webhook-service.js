// glovo-webhook-service.js
//
// ⚠️ Construit à partir de la documentation publique Glovo
// (qcommerce-integrations.glovoapp.com), PAS testé contre leur
// infrastructure réelle (aucun accès sandbox depuis mon environnement,
// et leur documentation détaillée des schémas JSON est bloquée par
// robots.txt, donc inaccessible même en lecture). Contrairement à
// Deliveroo, Glovo exige une intégration à DOUBLE SENS :
//   1. Réception des commandes (webhook Glovo → NoveResto) — construit
//      et structuré, mais noms de champs du payload à confirmer contre
//      un vrai webhook de test.
//   2. Envoi des statuts de préparation (NoveResto → Glovo, endpoint
//      "Update order status" avec ACCEPTED puis READY_FOR_PICKUP) —
//      nécessite un flux OAuth2 Client Credentials (client_id/secret →
//      jeton JWT valide 15 minutes) dont je n'ai NI les identifiants NI
//      l'URL exacte de l'endpoint de génération de jeton. Cette partie
//      est un SQUELETTE CLAIREMENT INCOMPLET, pas une implémentation
//      fonctionnelle — voir sendStatusToGlovo() plus bas.

const crypto = require('crypto');

/**
 * Vérification de l'authenticité d'une requête entrante. Contrairement
 * à Deliveroo (signature HMAC calculée), la documentation Glovo décrit
 * un jeton statique partagé (fourni par Glovo à l'activation, "All the
 * stores use the same token") transmis dans l'en-tête Authorization —
 * comparaison directe, pas de calcul cryptographique.
 */
function verifyWebhookToken(receivedToken, expectedToken) {
  if (!receivedToken || !expectedToken) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(receivedToken), Buffer.from(expectedToken));
  } catch {
    return false;
  }
}

async function findRestaurantConnection(pool, externalStoreId) {
  const result = await pool.query(
    `SELECT rdc.*, dp.code AS platform_code
     FROM restaurant_delivery_connections rdc
     JOIN delivery_platforms dp ON dp.id = rdc.delivery_platform_id
     WHERE dp.code = 'glovo' AND rdc.external_site_id = $1`,
    [externalStoreId]
  );
  return result.rows[0] || null;
}

/**
 * Transforme le payload Glovo en commande NoveResto. Mêmes principes que
 * Deliveroo : échec explicite (pas de devinette) si un article n'a pas
 * de correspondance enregistrée. Noms de champs (`products`, `productId`,
 * `quantity`, `price`...) basés sur les conventions habituelles de ce
 * type d'API — À CONFIRMER contre un vrai payload de test Glovo.
 */
async function createOrderFromWebhook(pool, connection, payload) {
  const items = payload.products || payload.items || [];
  if (items.length === 0) {
    const err = new Error('Aucun article dans le payload de commande');
    err.code = 'error_mapping';
    throw err;
  }

  const resolvedItems = [];
  for (const item of items) {
    const externalId = String(item.productId || item.id || item.sku || '');
    const refResult = await pool.query(
      `SELECT menu_item_id FROM menu_item_external_refs WHERE delivery_platform_id = $1 AND external_item_id = $2`,
      [connection.delivery_platform_id, externalId]
    );
    if (refResult.rows.length === 0) {
      const err = new Error(`Article Glovo sans correspondance interne : "${item.name || externalId}" (id externe: ${externalId}). Configure la correspondance dans Menus avant de retraiter cette commande.`);
      err.code = 'error_mapping';
      throw err;
    }
    resolvedItems.push({
      menu_item_id: refResult.rows[0].menu_item_id,
      item_name: item.name || 'Article Glovo',
      quantity: item.quantity || 1,
      unit_price: Number(item.price || 0),
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
      payload.orderId || payload.order_id || payload.id || null,
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

/**
 * ⚠️ SQUELETTE INCOMPLET — pas une implémentation fonctionnelle.
 *
 * Glovo exige d'envoyer le statut ACCEPTED au démarrage de la
 * préparation, puis READY_FOR_PICKUP à la fin — sans ça, l'intégration
 * n'est pas validée par leur équipe et ne passera jamais en production
 * (cf. "Integration validation" dans leur documentation).
 *
 * Ce que cette fonction ferait une fois complétée :
 *   1. Obtenir un jeton d'accès via OAuth2 Client Credentials (POST vers
 *      un endpoint "Generate Access Token" — URL exacte non confirmée,
 *      probablement quelque chose comme
 *      https://api.glovoapp.com/oauth/token, à vérifier dans la vraie
 *      documentation une fois l'accès obtenu), avec client_id/client_secret
 *      fournis par ton Account Manager Glovo après signature de l'accord
 *      partenaire.
 *   2. Mettre ce jeton en cache (valide 15 minutes), le régénérer à
 *      expiration plutôt que d'en demander un à chaque appel.
 *   3. Appeler l'endpoint de mise à jour de statut avec ce jeton.
 *
 * Pour l'instant, cette fonction se contente de journaliser ce qu'elle
 * AURAIT dû envoyer — utile pour voir le flux fonctionner côté NoveResto
 * sans bloquer sur les identifiants manquants, mais **la commande ne sera
 * pas confirmée côté Glovo tant que ceci n'est pas complété**.
 */
async function sendStatusToGlovo(pool, connection, externalOrderId, status) {
  console.warn(
    `[Glovo] ⚠️ sendStatusToGlovo() non implémenté — aurait dû envoyer le statut "${status}" ` +
    `pour la commande externe ${externalOrderId} (connexion #${connection.id}). ` +
    `Nécessite un jeton OAuth2 (client_id/client_secret Glovo) non configuré.`
  );
  return { sent: false, reason: 'oauth_not_configured' };
}

module.exports = { verifyWebhookToken, findRestaurantConnection, createOrderFromWebhook, logWebhook, sendStatusToGlovo };
