// inventory-service.js
// Enregistre un comptage physique d'un ingrédient : compare le stock
// théorique (ingredients.current_stock, alimenté automatiquement par
// stock-service.deductStockForOrder à chaque commande) au comptage réel,
// trace l'écart en quantité ET en valeur, et resynchronise current_stock
// sur la valeur réelle comptée (le comptage physique fait foi).

/**
 * Enregistre un comptage et calcule l'écart. Transactionnel : snapshot du
 * stock théorique, insertion du comptage, resynchronisation du stock,
 * et mouvement de correction tracé — même pattern que receivePurchaseOrder.
 */
async function recordCount(pool, ingredientId, countedQuantity, { restaurantId, userId, note } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const ingRes = await client.query(
      `SELECT current_stock, unit_cost, unit FROM ingredients
       WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [ingredientId, restaurantId]
    );
    if (ingRes.rows.length === 0) {
      const err = new Error('Ingrédient introuvable');
      err.statusCode = 404;
      throw err;
    }
    const ing = ingRes.rows[0];
    const theoreticalQuantity = Number(ing.current_stock);
    const variance = Number(countedQuantity) - theoreticalQuantity;
    const varianceValue = variance * Number(ing.unit_cost);

    const countRes = await client.query(
      `INSERT INTO inventory_counts
         (restaurant_id, ingredient_id, theoretical_quantity, counted_quantity, variance, variance_value, unit, note, counted_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [restaurantId, ingredientId, theoreticalQuantity, countedQuantity, variance, varianceValue, ing.unit, note || null, userId || null]
    );
    const count = countRes.rows[0];

    await client.query(
      'UPDATE ingredients SET current_stock = $1 WHERE id = $2',
      [countedQuantity, ingredientId]
    );

    await client.query(
      `INSERT INTO stock_movements
         (restaurant_id, ingredient_id, movement_type, quantity, reference_type, reference_id, note, created_by)
       VALUES ($1,$2,'correction',$3,'inventory_count',$4,$5,$6)`,
      [restaurantId, ingredientId, variance, count.id, note || 'Comptage physique', userId || null]
    );

    await client.query('COMMIT');
    return count;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Agrège les écarts sur une période, triés par valeur perdue (les plus
 * grosses pertes en premier). C'est la métrique différenciante marge.
 */
async function getVarianceSummary(pool, restaurantId, { fromDate, toDate } = {}) {
  const conditions = ['ic.restaurant_id = $1'];
  const params = [restaurantId];
  let idx = 2;
  if (fromDate) { conditions.push(`ic.counted_at >= $${idx++}`); params.push(fromDate); }
  if (toDate) { conditions.push(`ic.counted_at <= $${idx++}`); params.push(toDate); }

  const result = await pool.query(
    `SELECT ic.ingredient_id, i.name AS ingredient_name, i.unit,
            COUNT(*) AS count_events,
            SUM(ic.variance) AS total_variance_qty,
            SUM(ic.variance_value) AS total_variance_value
     FROM inventory_counts ic
     JOIN ingredients i ON i.id = ic.ingredient_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY ic.ingredient_id, i.name, i.unit
     ORDER BY total_variance_value ASC`,
    params
  );

  const totalLossValue = result.rows
    .filter((r) => Number(r.total_variance_value) < 0)
    .reduce((sum, r) => sum + Number(r.total_variance_value), 0);

  return { restaurant_id: restaurantId, total_loss_value: Math.round(totalLossValue * 1000) / 1000, items: result.rows };
}

module.exports = { recordCount, getVarianceSummary };
