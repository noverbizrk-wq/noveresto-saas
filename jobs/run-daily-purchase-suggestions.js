// jobs/run-daily-purchase-suggestions.js
// Script autonome (pas PM2, lancé par crontab système) qui rejoue pour
// chaque restaurant actif la boucle : prévision ingrédient -> suggestion
// de commande. Réutilise les services déjà en prod, aucune duplication
// de logique.
//
// Usage : node jobs/run-daily-purchase-suggestions.js
// Cron recommandé : 0 6 * * * (tous les jours à 6h, avant l'ouverture)

const { Pool } = require('pg');

// Même config que server.js — pas de .env pour la DB dans ce projet.
const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'noveresto', user: 'noveresto', password: 'NoveResto2025!'
});

const { persistIngredientForecast } = require('../services/forecast-service');
const { generateForRestaurant } = require('../services/purchase-suggestion-service');

const FORECAST_HORIZON_DAYS = 14;

async function run() {
  const startedAt = new Date();
  console.log(`[${startedAt.toISOString()}] Démarrage du job suggestions de commande`);

  const restaurantsRes = await pool.query(
    `SELECT DISTINCT restaurant_id FROM ingredients WHERE auto_suggest_enabled = true`
  );

  let totalForecasted = 0;
  let totalSuggestions = 0;
  const errors = [];

  for (const row of restaurantsRes.rows) {
    const restaurantId = row.restaurant_id;
    try {
      const forecastResult = await persistIngredientForecast(pool, restaurantId, FORECAST_HORIZON_DAYS);
      if (forecastResult.warning) {
        console.log(`  restaurant ${restaurantId}: ${forecastResult.warning}`);
        continue;
      }
      totalForecasted += forecastResult.persisted || 0;

      const created = await generateForRestaurant(pool, restaurantId);
      totalSuggestions += created.length;
      console.log(`  restaurant ${restaurantId}: ${forecastResult.persisted} prévisions, ${created.length} suggestions générées`);
    } catch (err) {
      console.error(`  restaurant ${restaurantId}: ERREUR — ${err.message}`);
      errors.push({ restaurantId, error: err.message });
    }
  }

  const durationMs = Date.now() - startedAt.getTime();
  console.log(`[${new Date().toISOString()}] Terminé en ${durationMs}ms — ${restaurantsRes.rows.length} restaurants, ${totalForecasted} prévisions, ${totalSuggestions} suggestions, ${errors.length} erreurs`);

  await pool.end();
  process.exit(errors.length > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Erreur fatale du job:', err);
  pool.end().finally(() => process.exit(1));
});
