// google-business-routes.js
//
// Connexion OAuth2 d'un restaurant à son compte Google Business Profile
// (nécessaire pour publier de vraies réponses sur Google Maps — cf.
// services/google-business-service.js pour les prérequis Google Cloud).
//
// Même découpage que deliveroo-routes.js/glovo-routes.js : un routeur
// PUBLIC (oauthRouter, Google redirige le navigateur ici sans notre
// Authorization header) et un routeur AUTHENTIFIÉ (manageRouter, connect/
// status/disconnect déclenchés depuis le dashboard).

const express = require('express');
const oauthRouter = express.Router();
const manageRouter = express.Router();
const googleBusinessService = require('./services/google-business-service');

module.exports = function (pool, authMiddleware, restaurantScope) {

  // ---------- PUBLIC : callback OAuth (Google redirige ici) ----------

  // GET /api/v1/google-business/oauth/callback?code=...&state=...
  oauthRouter.get('/oauth/callback', async (req, res) => {
    const { code, state, error: googleError } = req.query;
    // Configuration centralisee : la connexion/deconnexion Google Business
    // Profile se pilote depuis /dashboard/settings, pas depuis Reputation.
    const redirectBase = 'https://noveresto.app/app/dashboard/settings';

    if (googleError) {
      return res.redirect(`${redirectBase}?google_connect=error&reason=${encodeURIComponent(googleError)}`);
    }
    if (!code || !state) {
      return res.redirect(`${redirectBase}?google_connect=error&reason=missing_code`);
    }

    let restaurantId;
    try {
      restaurantId = googleBusinessService.verifyState(state);
    } catch (e) {
      return res.redirect(`${redirectBase}?google_connect=error&reason=invalid_state`);
    }

    try {
      const tokens = await googleBusinessService.exchangeCodeForTokens(code);
      const accounts = await googleBusinessService.fetchAccounts(tokens.access_token);
      if (accounts.length === 0) {
        return res.redirect(`${redirectBase}?google_connect=error&reason=no_business_account`);
      }
      // MVP : prend le premier compte + premier etablissement. Un
      // restaurateur avec plusieurs etablissements Google devra les
      // reconnecter individuellement si besoin (pas gere pour l'instant).
      const account = accounts[0];
      const locations = await googleBusinessService.fetchLocations(tokens.access_token, account.name);
      if (locations.length === 0) {
        return res.redirect(`${redirectBase}?google_connect=error&reason=no_location`);
      }
      const location = locations[0];
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      await pool.query(
        `INSERT INTO google_business_connections
          (restaurant_id, google_account_name, google_location_name, location_title, access_token, refresh_token, token_expires_at, status, connected_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'connected',$1)
         ON CONFLICT (restaurant_id) DO UPDATE SET
           google_account_name = EXCLUDED.google_account_name,
           google_location_name = EXCLUDED.google_location_name,
           location_title = EXCLUDED.location_title,
           access_token = EXCLUDED.access_token,
           refresh_token = EXCLUDED.refresh_token,
           token_expires_at = EXCLUDED.token_expires_at,
           status = 'connected',
           updated_at = now()`,
        [restaurantId, account.name, location.name, location.title || null, tokens.access_token, tokens.refresh_token, expiresAt]
      );

      res.redirect(`${redirectBase}?google_connect=success`);
    } catch (e) {
      console.error('[google-business] callback OAuth echoue:', e.message);
      res.redirect(`${redirectBase}?google_connect=error&reason=${encodeURIComponent(e.message)}`);
    }
  });

  // ---------- AUTHENTIFIÉ : gestion de la connexion ----------

  manageRouter.use(authMiddleware);

  // GET /api/v1/reputation/google/config — l'UI s'en sert pour
  // savoir si le bouton "Connecter Google" doit meme etre affiche.
  manageRouter.get('/google/config', (req, res) => {
    res.json({ configured: googleBusinessService.isConfigured() });
  });

  // GET /api/v1/reputation/google/connect — renvoie l'URL de consentement
  // Google en JSON (et non un redirect direct) : le navigateur ne peut
  // pas porter notre Authorization header sur une simple navigation, donc
  // le frontend appelle cette route en authentifie puis fait lui-meme
  // window.location.href = redirect_url. Evite aussi de faire transiter
  // le JWT dans l'URL (logs serveur, historique navigateur).
  manageRouter.get('/google/connect', restaurantScope, (req, res) => {
    if (!googleBusinessService.isConfigured()) {
      return res.status(503).json({ error: "Connexion Google Business Profile non configuree cote serveur (GOOGLE_OAUTH_CLIENT_ID/SECRET manquants)" });
    }
    res.json({ redirect_url: googleBusinessService.getAuthUrl(req.scopedRestaurantId) });
  });

  // GET /api/v1/reputation/google/status
  manageRouter.get('/google/status', restaurantScope, async (req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT location_title, status, created_at FROM google_business_connections WHERE restaurant_id = $1',
        [req.scopedRestaurantId]
      );
      res.json({ connected: rows.length > 0 && rows[0].status === 'connected', connection: rows[0] || null });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/reputation/google/disconnect
  manageRouter.post('/google/disconnect', restaurantScope, async (req, res) => {
    try {
      await pool.query('DELETE FROM google_business_connections WHERE restaurant_id = $1', [req.scopedRestaurantId]);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return { oauthRouter, manageRouter };
};
