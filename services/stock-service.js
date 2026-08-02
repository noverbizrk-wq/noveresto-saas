// stock-service.js
// Gère les mouvements de stock : déduction automatique à la complétion
// d'une commande (via les fiches techniques), réception d'achats fournisseur,
// et ajustement manuel.

const { logAction } = require('./audit-log-service');

/**
 * Déduit le stock des ingrédients consommés par une commande terminée,
 * selon les fiches techniques (recipe_ingredients) des articles commandés.
 * Appelée depuis orders-service.changeOrderStatus() quand status='completed'.
 * Ne bloque jamais la mise à jour de la commande en cas d'échec (best-effort,
 * comme le pattern déjà en place pour audit-log-service).
 */
async function deductStockForOrder(pool, orderId, { restaurantId, userId } = {}) {
  try {
    const itemsRes = await pool.query(
      `SELECT oi.menu_item_id, oi.quantity AS ordered_qty
       FROM order_items oi
       WHERE oi.order_id = $1 AND oi.is_cancelled = false`,
      [orderId]
    );

    for (const orderItem of itemsRes.rows) {
      const recipeRes = await pool.query(
        'SELECT ingredient_id, quantity FROM recipe_ingredients WHERE menu_item_id = $1',
        [orderItem.menu_item_id]
      );

      for (const ri of recipeRes.rows) {
        const consumedQty = Number(ri.quantity) * Number(orderItem.ordered_qty);

        await pool.query(
          'UPDATE ingredients SET current_stock = current_stock - $1 WHERE id = $2',
          [consumedQty, ri.ingredient_id]
        );

        await pool.query(
          `INSERT INTO stock_movements
            (restaurant_id, ingredient_id, movement_type, quantity, reference_type, reference_id, created_by)
           VALUES ($1,$2,'consumption',$3,'order',$4,$5)`,
          [restaurantId, ri.ingredient_id, -consumedQty, orderId, userId || null]
        );
      }
    }
  } catch (err) {
    console.error('[stock-service] échec déduction stock (commande non bloquée):', err.message);
  }
}

/**
 * Marque une commande d'achat comme reçue : incrémente le stock de chaque
 * ingrédient, met à jour le dernier prix d'achat connu (unit_cost), et
 * journalise chaque mouvement.
 */
async function receivePurchaseOrder(pool, purchaseOrderId, { userId } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const poRes = await client.query(
      'SELECT id, restaurant_id, status FROM purchase_orders WHERE id = $1 FOR UPDATE',
      [purchaseOrderId]
    );
    if (poRes.rows.length === 0) {
      const err = new Error('Commande d\'achat introuvable');
      err.statusCode = 404;
      throw err;
    }
    const po = poRes.rows[0];
    if (po.status === 'received') {
      const err = new Error('Commande d\'achat déjà réceptionnée');
      err.statusCode = 409;
      throw err;
    }

    const itemsRes = await client.query(
      'SELECT ingredient_id, quantity, unit_price FROM purchase_order_items WHERE purchase_order_id = $1',
      [purchaseOrderId]
    );

    for (const item of itemsRes.rows) {
      await client.query(
        'UPDATE ingredients SET current_stock = current_stock + $1, unit_cost = $2 WHERE id = $3',
        [item.quantity, item.unit_price, item.ingredient_id]
      );
      await client.query(
        `INSERT INTO stock_movements
          (restaurant_id, ingredient_id, movement_type, quantity, reference_type, reference_id, created_by)
         VALUES ($1,$2,'purchase_receipt',$3,'purchase_order',$4,$5)`,
        [po.restaurant_id, item.ingredient_id, item.quantity, purchaseOrderId, userId || null]
      );
    }

    const updated = await client.query(
      `UPDATE purchase_orders SET status = 'received', received_at = now() WHERE id = $1 RETURNING *`,
      [purchaseOrderId]
    );

    await client.query('COMMIT');

    await logAction(pool, {
      restaurantId: po.restaurant_id,
      userId,
      action: 'purchase_order.received',
      entityType: 'purchase_order',
      entityId: purchaseOrderId,
      details: { items_count: itemsRes.rows.length }
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
 * Ajustement manuel de stock (correction d'inventaire, perte constatée, etc.)
 */
async function adjustStock(pool, ingredientId, quantityDelta, { restaurantId, userId, movementType = 'correction', note } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE ingredients SET current_stock = current_stock + $1 WHERE id = $2',
      [quantityDelta, ingredientId]
    );
    await client.query(
      `INSERT INTO stock_movements
        (restaurant_id, ingredient_id, movement_type, quantity, reference_type, note, created_by)
       VALUES ($1,$2,$3,$4,'manual',$5,$6)`,
      [restaurantId, ingredientId, movementType, quantityDelta, note || null, userId || null]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { deductStockForOrder, receivePurchaseOrder, adjustStock };
