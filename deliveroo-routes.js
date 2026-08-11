// deliveroo-routes.js
//
// Deux familles de routes distinctes :
//  - /api/v1/webhooks/deliveroo/orders : PUBLIC, non authentifié par JWT
//    (Deliveroo n'a pas de compte NoveResto) — sécurisé par vérification
//    de signature HMAC à la place.
//  - /api/v1/restaurant/deliveroo/* : authentifié, pour configurer sa
//    propre connexion et le mapping des articles.

const express = require('express');
const webhookRouter = express.Router();
const manageRouter = express.Router();
const deliverooService = require('./services/deliveroo-webhook-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  // ── Webhook public ──────────────────────────────────────────────────────
  // IMPORTANT: nécessite express.raw() sur cette route précise dans
  // server.js (avant express.json() global) — la vérification HMAC a
  // besoin du corps BRUT de la requête, pas du JSON déjà parsé.
  webhookRouter.post('/deliveroo/orders', async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'Payload JSON invalide' });
    }

    const guid = req.header('X-Deliveroo-Sequence-Guid');
    const receivedHmac = req.header('X-Deliveroo-Hmac-Sha256');
    const externalSiteId = payload.site_id || payload.location_id || payload.restaurant_id;

    const connection = await deliverooService.findRestaurantConnection(pool, externalSiteId);
    if (!connection) {
      // Pas de compte associé à ce site — on logue quand même (payload
      // orphelin) pour pouvoir diagnostiquer plutôt que de rejeter dans
      // le vide.
      await deliverooService.logWebhook(pool, {
        deliveryPlatformId: null, restaurantId: null, eventType: payload.event_type,
        rawPayload: payload, signatureValid: null, status: 'error_other',
        errorMessage: `Aucune connexion trouvée pour external_site_id=${externalSiteId}`,
      });
      return res.status(404).json({ error: 'Site inconnu' });
    }

    const signatureValid = deliverooService.verifySignature(guid, rawBody, receivedHmac, connection.webhook_secret);
    if (!signatureValid) {
      await deliverooService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type, rawPayload: payload, signatureValid: false, status: 'error_signature',
        errorMessage: 'Signature HMAC invalide',
      });
      return res.status(401).json({ error: 'Signature invalide' });
    }

    try {
      const orderId = await deliverooService.createOrderFromWebhook(pool, connection, payload);
      await deliverooService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type, rawPayload: payload, signatureValid: true, status: 'order_created',
        orderId,
      });
      res.status(200).json({ received: true, order_id: orderId });
    } catch (err) {
      await deliverooService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type, rawPayload: payload, signatureValid: true,
        status: err.code || 'error_other', errorMessage: err.message,
      });
      // 200 quand même : Deliveroo réessaiera sinon indéfiniment un
      // payload qui échouera toujours pour la même raison (mapping
      // manquant). L'erreur est visible dans delivery_webhook_log pour
      // traitement manuel.
      res.status(200).json({ received: true, error: err.message });
    }
  });

  // ── Gestion authentifiée ────────────────────────────────────────────────
  manageRouter.use(authMiddleware);

  // PATCH /api/v1/restaurant/deliveroo/connection
  manageRouter.patch('/deliveroo/connection', restaurantScope, async (req, res) => {
    try {
      const { external_site_id, webhook_secret, api_key, api_secret, status } = req.body;
      const platform = await pool.query(`SELECT id FROM delivery_platforms WHERE code = 'deliveroo'`);
      const platformId = platform.rows[0].id;
      const result = await pool.query(
        `INSERT INTO restaurant_delivery_connections (restaurant_id, delivery_platform_id, external_site_id, webhook_secret, api_key, api_secret, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (restaurant_id, delivery_platform_id) DO UPDATE SET
           external_site_id = COALESCE(EXCLUDED.external_site_id, restaurant_delivery_connections.external_site_id),
           webhook_secret = COALESCE(EXCLUDED.webhook_secret, restaurant_delivery_connections.webhook_secret),
           api_key = COALESCE(EXCLUDED.api_key, restaurant_delivery_connections.api_key),
           api_secret = COALESCE(EXCLUDED.api_secret, restaurant_delivery_connections.api_secret),
           status = COALESCE(EXCLUDED.status, restaurant_delivery_connections.status),
           updated_at = now()
         RETURNING id, external_site_id, status, last_order_at`,
        [req.scopedRestaurantId, platformId, external_site_id, webhook_secret, api_key, api_secret, status || 'sandbox']
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/deliveroo/connection
  manageRouter.get('/deliveroo/connection', restaurantScope, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT rdc.id, rdc.external_site_id, rdc.status, rdc.last_order_at,
                (rdc.webhook_secret IS NOT NULL) AS has_webhook_secret,
                (rdc.api_key IS NOT NULL) AS has_api_key
         FROM restaurant_delivery_connections rdc
         JOIN delivery_platforms dp ON dp.id = rdc.delivery_platform_id
         WHERE dp.code = 'deliveroo' AND rdc.restaurant_id = $1`,
        [req.scopedRestaurantId]
      );
      res.json(result.rows[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/deliveroo/webhook-logs — pour diagnostiquer
  manageRouter.get('/deliveroo/webhook-logs', restaurantScope, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT id, event_type, signature_valid, processing_status, error_message, order_id, created_at
         FROM delivery_webhook_log WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.scopedRestaurantId]
      );
      res.json({ data: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/menus/:menuItemId/deliveroo-mapping — { external_item_id, external_name }
  manageRouter.post('/menus/:menuItemId/deliveroo-mapping', restaurantScope, async (req, res) => {
    try {
      const { external_item_id, external_name } = req.body;
      if (!external_item_id) return res.status(400).json({ error: 'external_item_id requis' });
      // Vérifie que cet article de menu appartient bien au compte (IDOR)
      const owned = await pool.query(`SELECT 1 FROM menu_items WHERE id = $1 AND restaurant_id = $2`, [req.params.menuItemId, req.scopedRestaurantId]);
      if (owned.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });

      const platform = await pool.query(`SELECT id FROM delivery_platforms WHERE code = 'deliveroo'`);
      const result = await pool.query(
        `INSERT INTO menu_item_external_refs (menu_item_id, delivery_platform_id, external_item_id, external_name)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (delivery_platform_id, external_item_id) DO UPDATE SET menu_item_id = EXCLUDED.menu_item_id, external_name = EXCLUDED.external_name
         RETURNING *`,
        [req.params.menuItemId, platform.rows[0].id, external_item_id, external_name || null]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return { webhookRouter, manageRouter };
};
