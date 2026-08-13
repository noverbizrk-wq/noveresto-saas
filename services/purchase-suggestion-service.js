// purchase-suggestion-service.js
// Applique la formule :
//   quantité_à_commander = besoin_prévisionnel (sur lead_time_days)
//                         + min_stock (stock de sécurité, déjà en base)
//                         - current_stock (déjà en base)
//                         - commandes déjà en cours (purchase_orders/purchase_order_items,
//                           status 'draft' ou 'sent', pas encore 'received')
//
// Ne crée PAS de purchase_order automatiquement — génère une ligne dans
// purchase_suggestions, status 'pending', validation humaine obligatoire
// (cohérent avec le principe déjà appliqué sur les avis clients critiques).

async function generateForRestaurant(pool, restaurantId) {
  const ingredientsResult = await pool.query(
    `SELECT id, name, unit, current_stock, min_stock, lead_time_days, supplier_id
     FROM ingredients
     WHERE restaurant_id = $1 AND auto_suggest_enabled = true`,
    [restaurantId]
  );

  const created = [];
  for (const ing of ingredientsResult.rows) {
    const suggestion = await computeSuggestion(pool, restaurantId, ing);
    if (suggestion.quantity > 0) {
      const id = await upsertSuggestion(pool, restaurantId, ing, suggestion);
      if (id) created.push({ id, ingredient_id: ing.id, quantity: suggestion.quantity });
    }
  }
  return created;
}

async function computeSuggestion(pool, restaurantId, ingredient) {
  const forecastResult = await pool.query(
    `SELECT COALESCE(SUM(quantity_predicted), 0) AS total
     FROM ingredient_forecasts
     WHERE restaurant_id = $1 AND ingredient_id = $2
       AND forecast_date BETWEEN CURRENT_DATE AND CURRENT_DATE + $3::int`,
    [restaurantId, ingredient.id, ingredient.lead_time_days]
  );
  const forecastedNeed = Number(forecastResult.rows[0].total);

  const pendingResult = await pool.query(
    `SELECT COALESCE(SUM(poi.quantity), 0) AS total
     FROM purchase_order_items poi
     JOIN purchase_orders po ON po.id = poi.purchase_order_id
     WHERE po.restaurant_id = $1 AND poi.ingredient_id = $2
       AND po.status IN ('draft', 'sent')`,
    [restaurantId, ingredient.id]
  );
  const pendingOrders = Number(pendingResult.rows[0].total);

  const currentStock = Number(ingredient.current_stock);
  const safetyStock = Number(ingredient.min_stock);

  const rawQuantity = forecastedNeed + safetyStock - currentStock - pendingOrders;
  const quantity = Math.max(0, Math.round(rawQuantity * 1000) / 1000);

  return {
    quantity,
    basis: { forecastedNeed, safetyStock, currentStock, pendingOrders, leadTimeDays: ingredient.lead_time_days },
  };
}

async function upsertSuggestion(pool, restaurantId, ingredient, suggestion) {
  // Une seule suggestion pending par ingrédient et par jour (évite les doublons si le job tourne 2x)
  const existing = await pool.query(
    `SELECT id FROM purchase_suggestions
     WHERE restaurant_id = $1 AND ingredient_id = $2 AND status = 'pending'
       AND generated_at::date = CURRENT_DATE`,
    [restaurantId, ingredient.id]
  );
  if (existing.rows.length > 0) return null; // déjà généré aujourd'hui, ne pas dupliquer

  const insertResult = await pool.query(
    `INSERT INTO purchase_suggestions
       (restaurant_id, ingredient_id, suggested_quantity, unit, supplier_id, calculation_basis, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id`,
    [restaurantId, ingredient.id, suggestion.quantity, ingredient.unit, ingredient.supplier_id, JSON.stringify(suggestion.basis)]
  );
  return insertResult.rows[0].id;
}

/**
 * Valide une suggestion : crée (ou complète) une purchase_order réelle,
 * avec sa ligne purchase_order_item, et marque la suggestion comme validée.
 * Regroupe par fournisseur si plusieurs suggestions validées dans le même appel
 * (non géré ici — validation unitaire, cf. route).
 */
async function validateSuggestion(pool, restaurantId, suggestionId, userId, adjustedQuantity) {
  const suggResult = await pool.query(
    `SELECT * FROM purchase_suggestions WHERE id = $1 AND restaurant_id = $2 AND status = 'pending'`,
    [suggestionId, restaurantId]
  );
  if (suggResult.rows.length === 0) {
    const err = new Error('Suggestion introuvable ou déjà traitée');
    err.statusCode = 404;
    throw err;
  }
  const sugg = suggResult.rows[0];
  const finalQuantity = adjustedQuantity !== undefined ? Number(adjustedQuantity) : Number(sugg.suggested_quantity);

  // Récupère unit_cost courant pour la ligne de commande
  const ingRes = await pool.query('SELECT unit_cost FROM ingredients WHERE id = $1', [sugg.ingredient_id]);
  const unitCost = ingRes.rows.length > 0 ? Number(ingRes.rows[0].unit_cost) : 0;

  const poResult = await pool.query(
    `INSERT INTO purchase_orders (restaurant_id, supplier_id, status, created_by, total_amount)
     VALUES ($1, $2, 'draft', $3, $4) RETURNING id`,
    [restaurantId, sugg.supplier_id, userId, finalQuantity * unitCost]
  );
  const purchaseOrderId = poResult.rows[0].id;

  await pool.query(
    `INSERT INTO purchase_order_items (purchase_order_id, ingredient_id, quantity, unit_price)
     VALUES ($1, $2, $3, $4)`,
    [purchaseOrderId, sugg.ingredient_id, finalQuantity, unitCost]
  );

  await pool.query(
    `UPDATE purchase_suggestions
     SET status = 'validated', reviewed_by = $1, reviewed_at = now(), purchase_order_id = $2, suggested_quantity = $3
     WHERE id = $4`,
    [userId, purchaseOrderId, finalQuantity, suggestionId]
  );

  return { purchase_order_id: purchaseOrderId, quantity: finalQuantity };
}

async function rejectSuggestion(pool, restaurantId, suggestionId, userId) {
  const result = await pool.query(
    `UPDATE purchase_suggestions
     SET status = 'rejected', reviewed_by = $1, reviewed_at = now()
     WHERE id = $2 AND restaurant_id = $3 AND status = 'pending'
     RETURNING id`,
    [userId, suggestionId, restaurantId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Suggestion introuvable ou déjà traitée');
    err.statusCode = 404;
    throw err;
  }
  return true;
}

module.exports = { generateForRestaurant, computeSuggestion, validateSuggestion, rejectSuggestion };
