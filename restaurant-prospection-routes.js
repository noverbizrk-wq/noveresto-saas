// restaurant-prospection-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-8.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prospectionService = require('./services/prospection-service');

// Recherche = appels Google Places facturés (coût réel par requête) —
// limite dédiée, plus stricte que les endpoints internes.
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { error: 'Trop de recherches de prospection. Patientez quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const prospectionAccess = require('./middleware/module-access-middleware')(pool, 'prospection');

  // POST /api/v1/restaurant/prospection/search  { zone_label, category }
  router.post('/prospection/search', searchLimiter, restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { zone_label, category } = req.body;
      if (!zone_label || !zone_label.trim()) {
        return res.status(400).json({ error: 'zone_label requis' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ error: 'category requis' });
      }
      const results = await prospectionService.searchAndSaveProspects(pool, req.scopedRestaurantId, {
        zoneLabel: zone_label.trim(),
        category: category.trim(),
        userId: req.user?.id
      });
      res.json({ data: results });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/prospection/list?tier=&status=
  router.get('/prospection/list', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { tier, status } = req.query;
      const data = await prospectionService.listProspects(pool, req.scopedRestaurantId, { tier, status });
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/prospection/:id  { status, notes }
  router.patch('/prospection/:id', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { status, notes } = req.body;
      const updated = await prospectionService.updateProspectStatus(pool, req.params.id, req.scopedRestaurantId, { status, notes });
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
