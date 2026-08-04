// restaurant-copilot-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-4.

const express = require('express');
const router = express.Router();
const copilotService = require('./services/copilot-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  // GET /api/v1/restaurant/copilot/context — données brutes utilisées par le copilote
  router.get('/copilot/context', restaurantScope, async (req, res) => {
    try {
      const context = await copilotService.buildRestaurantContext(pool, req.scopedRestaurantId);
      res.json(context);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/copilot/recommendations — alertes calculées (pas d'IA)
  router.get('/copilot/recommendations', restaurantScope, async (req, res) => {
    try {
      const recommendations = await copilotService.getRecommendations(pool, req.scopedRestaurantId);
      res.json({ data: recommendations });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/copilot/ask  { question }
  router.post('/copilot/ask', restaurantScope, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !question.trim()) {
        return res.status(400).json({ error: 'question requise' });
      }
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: 'Copilote IA non configuré (clé API manquante)' });
      }
      const result = await copilotService.askCopilot(pool, req.scopedRestaurantId, question.trim());
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'Le copilote n\'a pas pu répondre pour le moment. ' + err.message });
    }
  });

  return router;
};
