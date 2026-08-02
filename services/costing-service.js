// costing-service.js
// Calcul du coût matière et de la marge d'un article de menu à partir de sa
// fiche technique (recipe_ingredients x ingredients.unit_cost).

/**
 * Calcule le coût matière, le taux de coût matière et la marge d'un article.
 */
async function getMenuItemCost(pool, menuItemId) {
  const itemRes = await pool.query('SELECT id, name, price FROM menu_items WHERE id = $1', [menuItemId]);
  if (itemRes.rows.length === 0) {
    const err = new Error('Article introuvable');
    err.statusCode = 404;
    throw err;
  }
  const item = itemRes.rows[0];

  const ingredientsRes = await pool.query(
    `SELECT ri.id, ri.quantity, i.id AS ingredient_id, i.name, i.unit, i.unit_cost,
            (ri.quantity * i.unit_cost) AS line_cost
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE ri.menu_item_id = $1
     ORDER BY i.name`,
    [menuItemId]
  );

  const recipeCost = ingredientsRes.rows.reduce((sum, r) => sum + Number(r.line_cost), 0);
  const price = Number(item.price);
  const foodCostPct = price > 0 ? (recipeCost / price) * 100 : 0;
  const marginUnit = price - recipeCost;
  const marginPct = price > 0 ? (marginUnit / price) * 100 : 0;

  return {
    menu_item_id: item.id,
    menu_item_name: item.name,
    price,
    recipe_cost: Number(recipeCost.toFixed(3)),
    food_cost_pct: Number(foodCostPct.toFixed(2)),
    margin_unit: Number(marginUnit.toFixed(3)),
    margin_pct: Number(marginPct.toFixed(2)),
    ingredients: ingredientsRes.rows.map(r => ({
      recipe_ingredient_id: r.id,
      ingredient_id: r.ingredient_id,
      name: r.name,
      unit: r.unit,
      quantity: Number(r.quantity),
      unit_cost: Number(r.unit_cost),
      line_cost: Number(Number(r.line_cost).toFixed(3))
    }))
  };
}

/**
 * Calcule le coût pour tous les articles d'un restaurant (vue synthétique).
 */
async function getAllMenuItemCosts(pool, restaurantId) {
  const items = await pool.query(
    'SELECT id FROM menu_items WHERE restaurant_id = $1 ORDER BY name',
    [restaurantId]
  );
  const results = [];
  for (const row of items.rows) {
    results.push(await getMenuItemCost(pool, row.id));
  }
  return results;
}

module.exports = { getMenuItemCost, getAllMenuItemCosts };
