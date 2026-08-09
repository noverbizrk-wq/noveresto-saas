// public-diagnostic-routes.js
//
// Namespace /api/v1/public/* — délibérément SÉPARÉ de /api/v1/restaurant/*
// (qui exige toujours authentification + scope compte). Ce diagnostic est
// un outil marketing accessible à n'importe qui, pas une fonctionnalité
// réservée aux clients NoveResto.
//
// Rate limit strict et dédié : chaque appel coûte un vrai appel Google
// Places, et le endpoint est public donc plus exposé aux abus qu'un
// endpoint authentifié classique.

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const diagnosticService = require('./services/public-diagnostic-service');

const diagnosticLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,
  message: { error: 'Trop de diagnostics lancés. Réessayez dans une heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = function (pool) {

  // POST /api/v1/public/diagnostic  { business_name, city }
  router.post('/diagnostic', diagnosticLimiter, async (req, res) => {
    try {
      const { business_name, city } = req.body;
      if (!business_name || !business_name.trim()) {
        return res.status(400).json({ error: 'Le nom de l\'établissement est requis' });
      }
      if (!city || !city.trim()) {
        return res.status(400).json({ error: 'La ville est requise' });
      }
      const result = await diagnosticService.runDiagnostic(business_name.trim(), city.trim());
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
