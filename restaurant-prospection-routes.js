// restaurant-prospection-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-8.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const prospectionService = require('./services/prospection-service');
const pitchService = require('./services/prospect-pitch-service');

// Recherche = appels Google Places facturés (coût réel par requête) —
// limite dédiée, plus stricte que les endpoints internes.
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10,
  message: { error: 'Trop de recherches de prospection. Patientez quelques minutes.' },
  standardHeaders: true,
  legacyHeaders: false
});

// Génération de pitch = appel Claude API facturé — limite dédiée.
const pitchLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Trop de générations de message. Patientez une minute.' },
  standardHeaders: true,
  legacyHeaders: false
});

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const prospectionAccess = require('./middleware/module-access-middleware')(pool, 'prospection');

  // POST /api/v1/restaurant/prospection/search
  // Mode texte : { zone_label, category }
  // Mode carte : { latitude, longitude, radius_km, category, zone_label? }
  router.post('/prospection/search', searchLimiter, restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { zone_label, category, latitude, longitude, radius_km } = req.body;
      const isNearbyMode = latitude !== undefined && longitude !== undefined;

      if (!isNearbyMode && (!zone_label || !zone_label.trim())) {
        return res.status(400).json({ error: 'zone_label requis (ou latitude/longitude pour une recherche par carte)' });
      }
      if (isNearbyMode && (typeof latitude !== 'number' || typeof longitude !== 'number')) {
        return res.status(400).json({ error: 'latitude et longitude doivent être numériques' });
      }
      if (!category || !category.trim()) {
        return res.status(400).json({ error: 'category requis' });
      }

      const results = await prospectionService.searchAndSaveProspects(pool, req.scopedRestaurantId, {
        zoneLabel: zone_label ? zone_label.trim() : `Carte (${latitude.toFixed(3)}, ${longitude.toFixed(3)}) ±${radius_km || 3}km`,
        category: category.trim(),
        userId: req.user?.id,
        latitude: isNearbyMode ? latitude : undefined,
        longitude: isNearbyMode ? longitude : undefined,
        radiusKm: isNearbyMode ? (radius_km || 3) : undefined,
      });
      res.json({ data: results });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/prospects/:id/pitch — génère un message WhatsApp personnalisé via IA
  router.post('/prospects/:id/pitch', pitchLimiter, restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const prospects = await prospectionService.listProspects(pool, req.scopedRestaurantId, {});
      const prospect = prospects.find(p => p.id === Number(req.params.id));
      if (!prospect) return res.status(404).json({ error: 'Prospect introuvable' });
      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: 'Génération de pitch non configurée (clé API manquante)' });
      }
      const message = await pitchService.generatePitch(prospect);
      res.json({ message });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: 'La génération a échoué. ' + err.message });
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

  // GET /api/v1/restaurant/prospection/export.csv?tier=&status=
  router.get('/prospection/export.csv', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { tier, status } = req.query;
      const csv = await prospectionService.exportProspectsCsv(pool, req.scopedRestaurantId, { tier, status });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="prospects_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/v1/restaurant/prospection/:id  { status, notes, contact_name, next_action_date }
  router.patch('/prospection/:id', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { status, notes, contact_name, next_action_date } = req.body;
      const updated = await prospectionService.updateProspectStatus(pool, req.params.id, req.scopedRestaurantId, { status, notes, contact_name, next_action_date });
      res.json(updated);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  // GET /api/v1/restaurant/prospection/:id/interactions
  router.get('/prospection/:id/interactions', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const data = await prospectionService.listInteractions(pool, req.params.id, req.scopedRestaurantId);
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/restaurant/prospection/:id/interactions  { note }
  router.post('/prospection/:id/interactions', restaurantScope, prospectionAccess, async (req, res) => {
    try {
      const { note } = req.body;
      const created = await prospectionService.addInteraction(pool, req.params.id, req.scopedRestaurantId, { note, userId: req.user?.id });
      res.json(created);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
