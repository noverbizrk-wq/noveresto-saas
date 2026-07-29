/**
 * NoveResto — Routes API Social Media IA
 * Fichier : social-routes.js
 * 
 * Endpoints REST pour le module Social Media IA
 * À intégrer dans server.js existant
 */

const express = require('express');
const router = express.Router();
const socialAI = require('./social-ai');

// ── MIDDLEWARE AUTH (réutilise celui de server.js) ────────────────────────────
// Ces routes nécessitent authMiddleware — l'inclure lors de l'intégration

// ── RATE LIMITING PAR FORMULE ─────────────────────────────────────────────────
const TOKEN_LIMITS = {
  essentielle:  50000,   // ~50K tokens/mois
  croissance:   150000,  // ~150K tokens/mois
  performance:  400000,  // ~400K tokens/mois
};

// Vérifier les tokens disponibles (à implémenter avec PostgreSQL)
async function checkTokenBudget(restaurantId, formula, pool) {
  const thisMonth = new Date().toISOString().slice(0, 7);
  const res = await pool.query(
    `SELECT COALESCE(SUM(tokens_used), 0) as used 
     FROM social_token_usage 
     WHERE restaurant_id = $1 AND month = $2`,
    [restaurantId, thisMonth]
  );
  const used = parseInt(res.rows[0]?.used || 0);
  const limit = TOKEN_LIMITS[formula] || TOKEN_LIMITS.croissance;
  return { used, limit, remaining: limit - used, ok: used < limit };
}

// ── POST /api/v1/social/strategy ──────────────────────────────────────────────
// Génère la stratégie éditoriale initiale
router.post('/strategy', async (req, res) => {
  try {
    const { restaurant } = req.body;
    if (!restaurant) return res.status(400).json({ error: 'Données restaurant requises' });

    const strategy = await socialAI.generateEditorialStrategy(restaurant);
    res.json({ success: true, strategy });
  } catch (e) {
    console.error('Strategy generation error:', e.message);
    res.status(500).json({ error: 'Erreur génération stratégie', details: e.message });
  }
});

// ── POST /api/v1/social/calendar ──────────────────────────────────────────────
// Génère le calendrier éditorial mensuel
router.post('/calendar', async (req, res) => {
  try {
    const { restaurant, formula = 'croissance', month, platforms, strategy } = req.body;
    if (!restaurant) return res.status(400).json({ error: 'Données restaurant requises' });

    const calendar = await socialAI.generateMonthlyCalendar(restaurant, {
      formula,
      month: month || new Date().toISOString().slice(0, 7),
      platforms: platforms || ['facebook', 'instagram', 'tiktok'],
      strategy,
    });

    res.json({ success: true, calendar });
  } catch (e) {
    console.error('Calendar generation error:', e.message);
    res.status(500).json({ error: 'Erreur génération calendrier', details: e.message });
  }
});

// ── POST /api/v1/social/post/generate ─────────────────────────────────────────
// Génère une publication individuelle
router.post('/post/generate', async (req, res) => {
  try {
    const { restaurant, platform, theme, objective, content_type, dish, promotion, event } = req.body;
    if (!restaurant || !platform || !theme) {
      return res.status(400).json({ error: 'restaurant, platform et theme requis' });
    }

    const post = await socialAI.generatePost(restaurant, {
      platform, theme, objective, content_type, dish, promotion, event,
    });

    res.json({ success: true, post });
  } catch (e) {
    console.error('Post generation error:', e.message);
    res.status(500).json({ error: 'Erreur génération publication', details: e.message });
  }
});

// ── POST /api/v1/social/post/generate-all ─────────────────────────────────────
// Génère une publication pour toutes les plateformes
router.post('/post/generate-all', async (req, res) => {
  try {
    const { restaurant, theme, objective, content_type, dish, promotion, event, platforms } = req.body;
    if (!restaurant || !theme) {
      return res.status(400).json({ error: 'restaurant et theme requis' });
    }

    const posts = await socialAI.generateMultiPlatformPost(
      restaurant,
      { theme, objective, content_type, dish, promotion, event },
      platforms || ['facebook', 'instagram', 'tiktok']
    );

    res.json({ success: true, posts });
  } catch (e) {
    console.error('Multi-platform post error:', e.message);
    res.status(500).json({ error: 'Erreur génération multi-plateformes', details: e.message });
  }
});

// ── POST /api/v1/social/analytics/analyze ─────────────────────────────────────
// Analyse les performances et génère des recommandations
router.post('/analytics/analyze', async (req, res) => {
  try {
    const { restaurant, analytics, period = 'weekly' } = req.body;
    if (!restaurant || !analytics) {
      return res.status(400).json({ error: 'restaurant et analytics requis' });
    }

    const report = await socialAI.analyzePerformance(restaurant, analytics, period);
    res.json({ success: true, report });
  } catch (e) {
    console.error('Analytics error:', e.message);
    res.status(500).json({ error: 'Erreur analyse performances', details: e.message });
  }
});

// ── POST /api/v1/social/comment/reply ─────────────────────────────────────────
// Génère une réponse à un commentaire
router.post('/comment/reply', async (req, res) => {
  try {
    const { restaurant, comment } = req.body;
    if (!restaurant || !comment?.text) {
      return res.status(400).json({ error: 'restaurant et comment.text requis' });
    }

    const reply = await socialAI.generateCommentReply(restaurant, comment);
    res.json({ success: true, reply });
  } catch (e) {
    console.error('Comment reply error:', e.message);
    res.status(500).json({ error: 'Erreur génération réponse', details: e.message });
  }
});

// ── POST /api/v1/social/campaign/generate ─────────────────────────────────────
// Génère une proposition de campagne publicitaire
router.post('/campaign/generate', async (req, res) => {
  try {
    const { restaurant, campaign } = req.body;
    if (!restaurant || !campaign?.objective) {
      return res.status(400).json({ error: 'restaurant et campaign.objective requis' });
    }

    const proposal = await socialAI.generateAdCampaign(restaurant, campaign);

    // Vérification : toujours marquer validation_required = true
    proposal.validation_required = true;
    proposal.warning = 'Cette campagne nécessite votre validation explicite avant tout lancement.';

    res.json({ success: true, proposal });
  } catch (e) {
    console.error('Campaign generation error:', e.message);
    res.status(500).json({ error: 'Erreur génération campagne', details: e.message });
  }
});

// ── GET /api/v1/social/health ──────────────────────────────────────────────────
// Vérification état du moteur
router.get('/health', async (req, res) => {
  try {
    // Test rapide Claude API
    const test = await socialAI.callClaude(
      'Tu réponds en JSON uniquement.',
      'Réponds juste {"status":"ok"}',
      50
    );
    const parsed = socialAI.parseJSON(test);
    res.json({ 
      status: 'ok', 
      claude_api: parsed.status === 'ok' ? 'connected' : 'error',
      model: 'claude-sonnet-4-6',
      version: '1.0.0'
    });
  } catch (e) {
    res.status(500).json({ status: 'error', claude_api: 'error', message: e.message });
  }
});

module.exports = router;
