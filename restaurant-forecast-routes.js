// restaurant-forecast-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que
// restaurant-costing-routes.js. Gated par le module 'stocks' (déjà existant
// dans module_access, réutilisé — cohérent avec restaurant-stock-routes.js).

const express = require('express');
const router = express.Router();
const forecastService = require('./services/forecast-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const moduleAccessMiddleware = require('./middleware/module-access-middleware');
  const stocksAccess = moduleAccessMiddleware(pool, 'stocks');

  // GET /api/v1/restaurant/forecasts/ingredients?horizon=7
  router.get('/forecasts/ingredients', restaurantScope, stocksAccess, async (req, res) => {
    const horizon = parseInt(req.query.horizon, 10) || 7;
    if (horizon < 1 || horizon > 30) {
      return res.status(400).json({ error: 'horizon doit être entre 1 et 30 jours' });
    }
    try {
      const result = await forecastService.getIngredientForecast(pool, req.scopedRestaurantId, horizon);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/forecasts/ingredients/generate
  // Déclenche le calcul et persiste dans ingredient_forecasts (appelé par le
  // job planifié quotidien, ou manuellement pour rafraîchir).
  router.post('/forecasts/ingredients/generate', restaurantScope, stocksAccess, async (req, res) => {
    const horizon = parseInt(req.body.horizon, 10) || 14;
    try {
      const result = await forecastService.persistIngredientForecast(pool, req.scopedRestaurantId, horizon);
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
