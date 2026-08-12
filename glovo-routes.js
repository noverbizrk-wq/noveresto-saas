// glovo-routes.js
//
// Deux familles de routes, même structure que Deliveroo :
//  - /api/v1/webhooks/glovo/orders : PUBLIC, sécurisé par comparaison de
//    jeton statique (pas de HMAC, contrairement à Deliveroo — voir
//    glovo-webhook-service.js).
//  - /api/v1/restaurant/glovo/* : authentifié, configuration de compte.

const express = require('express');
const webhookRouter = express.Router();
const manageRouter = express.Router();
const glovoService = require('./glovo-webhook-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  // ── Webhook public ──────────────────────────────────────────────────────
  webhookRouter.post('/glovo/orders', async (req, res) => {
    const payload = req.body;
    const receivedToken = req.header('Authorization');
    const externalStoreId = payload.storeId || payload.store_id;

    const connection = await glovoService.findRestaurantConnection(pool, externalStoreId);
    if (!connection) {
      await glovoService.logWebhook(pool, {
        deliveryPlatformId: null, restaurantId: null, eventType: payload.event_type || 'order.created',
        rawPayload: payload, signatureValid: null, status: 'error_other',
        errorMessage: `Aucune connexion trouvée pour storeId=${externalStoreId}`,
      });
      return res.status(404).json({ error: 'Store inconnu' });
    }

    const tokenValid = glovoService.verifyWebhookToken(receivedToken, connection.webhook_secret);
    if (!tokenValid) {
      await glovoService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type || 'order.created', rawPayload: payload, signatureValid: false, status: 'error_signature',
        errorMessage: 'Jeton Authorization invalide',
      });
      return res.status(401).json({ error: 'Jeton invalide' });
    }

    try {
      const orderId = await glovoService.createOrderFromWebhook(pool, connection, payload);
      await glovoService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type || 'order.created', rawPayload: payload, signatureValid: true, status: 'order_created',
        orderId,
      });
      // Rappel : Glovo attend un statut ACCEPTED renvoyé — non implémenté,
      // voir sendStatusToGlovo() dans le service.
      await glovoService.sendStatusToGlovo(pool, connection, payload.orderId || payload.order_id, 'ACCEPTED');
      res.status(200).json({ received: true, order_id: orderId });
    } catch (err) {
      await glovoService.logWebhook(pool, {
        deliveryPlatformId: connection.delivery_platform_id, restaurantId: connection.restaurant_id,
        eventType: payload.event_type || 'order.created', rawPayload: payload, signatureValid: true,
        status: err.code || 'error_other', errorMessage: err.message,
      });
      res.status(200).json({ received: true, error: err.message });
    }
  });

  // ── Gestion authentifiée ────────────────────────────────────────────────
  manageRouter.use(authMiddleware);

  // PATCH /api/v1/restaurant/glovo/connection
  manageRouter.patch('/glovo/connection', restaurantScope, async (req, res) => {
    try {
      const { external_site_id, webhook_secret, status } = req.body;
      const platform = await pool.query(`SELECT id FROM delivery_platforms WHERE code = 'glovo'`);
      const platformId = platform.rows[0].id;
      const result = await pool.query(
        `INSERT INTO restaurant_delivery_connections (restaurant_id, delivery_platform_id, external_site_id, webhook_secret, status)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (restaurant_id, delivery_platform_id) DO UPDATE SET
           external_site_id = COALESCE(EXCLUDED.external_site_id, restaurant_delivery_connections.external_site_id),
           webhook_secret = COALESCE(EXCLUDED.webhook_secret, restaurant_delivery_connections.webhook_secret),
           status = COALESCE(EXCLUDED.status, restaurant_delivery_connections.status),
           updated_at = now()
         RETURNING id, external_site_id, status, last_order_at`,
        [req.scopedRestaurantId, platformId, external_site_id, webhook_secret, status || 'sandbox']
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/glovo/connection
  manageRouter.get('/glovo/connection', restaurantScope, async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT rdc.id, rdc.external_site_id, rdc.status, rdc.last_order_at,
                (rdc.webhook_secret IS NOT NULL) AS has_webhook_secret
         FROM restaurant_delivery_connections rdc
         JOIN delivery_platforms dp ON dp.id = rdc.delivery_platform_id
         WHERE dp.code = 'glovo' AND rdc.restaurant_id = $1`,
        [req.scopedRestaurantId]
      );
      res.json(result.rows[0] || null);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/menus/:menuItemId/glovo-mapping — { external_item_id, external_name }
  manageRouter.post('/menus/:menuItemId/glovo-mapping', restaurantScope, async (req, res) => {
    try {
      const { external_item_id, external_name } = req.body;
      if (!external_item_id) return res.status(400).json({ error: 'external_item_id requis' });
      const owned = await pool.query(`SELECT 1 FROM menu_items WHERE id = $1 AND restaurant_id = $2`, [req.params.menuItemId, req.scopedRestaurantId]);
      if (owned.rows.length === 0) return res.status(404).json({ error: 'Article introuvable' });

      const platform = await pool.query(`SELECT id FROM delivery_platforms WHERE code = 'glovo'`);
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
