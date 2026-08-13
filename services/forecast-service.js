// forecast-service.js
// Décompose ml_forecasts (CA global, Prophet) en besoin par ingrédient via
// l'historique réel des ventes par article (order_items) et les fiches
// techniques (recipe_ingredients).
//
// Principe (MVP, pas de réentraînement Prophet par ingrédient) :
//   ratio_item   = moyenne quotidienne historique de CA de l'article / CA quotidien moyen total
//   qty_prevue_item(date) = moyenne quotidienne historique de quantité de l'article
//                            × (revenue_tnd(date) prévu / CA quotidien moyen total)
//   besoin_ingredient(date) = Σ qty_prevue_item(date) × recipe_ingredients.quantity
//
// LOOKBACK_DAYS=30 par défaut — suffisant pour capter la saisonnalité hebdo
// (vendredi vs lundi) déjà observée dans le module Prophet existant.

const LOOKBACK_DAYS = 30;

async function getHistoricalDailyAverages(pool, restaurantId) {
  const result = await pool.query(
    `SELECT day, menu_item_id, SUM(qty) AS qty, SUM(revenue) AS revenue
     FROM (
       SELECT date_trunc('day', o.received_at) AS day, oi.menu_item_id,
              oi.quantity AS qty, (oi.quantity * oi.unit_price) AS revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.restaurant_id = $1
         AND o.received_at >= now() - INTERVAL '${LOOKBACK_DAYS} days'
         AND oi.is_cancelled = false
     ) sub
     GROUP BY day, menu_item_id`,
    [restaurantId]
  );

  const byItem = new Map(); // menu_item_id -> { totalQty, totalRevenue, days: Set }
  const dailyTotals = new Map(); // day -> totalRevenue (tous articles confondus)

  for (const row of result.rows) {
    const itemId = row.menu_item_id;
    if (!byItem.has(itemId)) byItem.set(itemId, { totalQty: 0, totalRevenue: 0, days: new Set() });
    const entry = byItem.get(itemId);
    entry.totalQty += Number(row.qty);
    entry.totalRevenue += Number(row.revenue);
    entry.days.add(row.day.toString());

    const dayKey = row.day.toString();
    dailyTotals.set(dayKey, (dailyTotals.get(dayKey) || 0) + Number(row.revenue));
  }

  const nbDaysObserved = dailyTotals.size || 1;
  const avgDailyRevenueTotal =
    Array.from(dailyTotals.values()).reduce((s, v) => s + v, 0) / nbDaysObserved;

  const perItem = [];
  for (const [itemId, entry] of byItem.entries()) {
    perItem.push({
      menu_item_id: itemId,
      avgDailyQty: entry.totalQty / nbDaysObserved,
    });
  }

  return { perItem, avgDailyRevenueTotal, nbDaysObserved };
}

async function getIngredientForecast(pool, restaurantId, horizonDays) {
  const { perItem, avgDailyRevenueTotal } = await getHistoricalDailyAverages(pool, restaurantId);

  if (avgDailyRevenueTotal <= 0 || perItem.length === 0) {
    return { restaurant_id: restaurantId, horizon_days: horizonDays, forecasts: [], warning: 'Historique de ventes insuffisant pour décomposer la prévision.' };
  }

  const mlForecasts = await pool.query(
    `SELECT forecast_date, revenue_tnd
     FROM ml_forecasts
     WHERE restaurant_id = $1
       AND forecast_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + $2::int
     ORDER BY forecast_date`,
    [restaurantId, horizonDays]
  );

  if (mlForecasts.rows.length === 0) {
    return { restaurant_id: restaurantId, horizon_days: horizonDays, forecasts: [], warning: 'Aucune prévision Prophet disponible sur cet horizon (ml_forecasts vide).' };
  }

  // recipe_ingredients pour tous les items concernés, en une requête
  const itemIds = perItem.map((i) => i.menu_item_id);
  const recipesResult = await pool.query(
    `SELECT menu_item_id, ingredient_id, quantity, i.unit
     FROM recipe_ingredients ri
     JOIN ingredients i ON i.id = ri.ingredient_id
     WHERE menu_item_id = ANY($1::int[])`,
    [itemIds]
  );

  // ingredient_id -> unit (pour la sortie)
  const ingredientUnits = new Map();
  recipesResult.rows.forEach((r) => ingredientUnits.set(r.ingredient_id, r.unit));

  // besoin par ingrédient et par date
  const byIngredientDate = new Map(); // `${ingredient_id}|${date}` -> qty

  for (const mf of mlForecasts.rows) {
    const dateStr = mf.forecast_date.toISOString ? mf.forecast_date.toISOString().slice(0, 10) : mf.forecast_date;
    const scaleFactor = Number(mf.revenue_tnd) / avgDailyRevenueTotal;

    for (const item of perItem) {
      const forecastedQtyItem = item.avgDailyQty * scaleFactor;
      const recipeLines = recipesResult.rows.filter((r) => r.menu_item_id === item.menu_item_id);
      for (const line of recipeLines) {
        const need = forecastedQtyItem * Number(line.quantity);
        const key = `${line.ingredient_id}|${dateStr}`;
        byIngredientDate.set(key, (byIngredientDate.get(key) || 0) + need);
      }
    }
  }

  const forecasts = [];
  for (const [key, qty] of byIngredientDate.entries()) {
    const [ingredientIdStr, date] = key.split('|');
    forecasts.push({
      ingredient_id: Number(ingredientIdStr),
      forecast_date: date,
      quantity_predicted: Math.round(qty * 1000) / 1000,
      unit: ingredientUnits.get(Number(ingredientIdStr)) || 'unite',
    });
  }

  return { restaurant_id: restaurantId, horizon_days: horizonDays, forecasts };
}

async function persistIngredientForecast(pool, restaurantId, horizonDays) {
  const { forecasts, warning } = await getIngredientForecast(pool, restaurantId, horizonDays);
  if (warning) return { persisted: 0, warning };

  let persisted = 0;
  for (const f of forecasts) {
    await pool.query(
      `INSERT INTO ingredient_forecasts (restaurant_id, ingredient_id, forecast_date, quantity_predicted, unit, method)
       VALUES ($1, $2, $3, $4, $5, 'ratio_v1')
       ON CONFLICT (restaurant_id, ingredient_id, forecast_date, method)
       DO UPDATE SET quantity_predicted = EXCLUDED.quantity_predicted, generated_at = now()`,
      [restaurantId, f.ingredient_id, f.forecast_date, f.quantity_predicted, f.unit]
    );
    persisted++;
  }
  return { persisted };
}

module.exports = { getIngredientForecast, persistIngredientForecast, getHistoricalDailyAverages };
