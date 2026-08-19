// google-business-service.js
//
// Intégration OAuth2 avec Google Business Profile — seule API Google qui
// permet de PUBLIER une réponse sur un vrai avis Google Maps (la Places
// API déjà utilisée ailleurs dans reputation-routes.js est en lecture
// seule, simple clé API, aucune notion d'écriture).
//
// ⚠️ PRÉREQUIS CÔTÉ GOOGLE CLOUD CONSOLE (à faire une fois, par Ridha) :
//   1. Projet Google Cloud (peut réutiliser celui de GOOGLE_PLACES_API_KEY).
//   2. Activer l'API "Google Business Profile" / "My Business API".
//      ⚠️ La gestion des avis (reviews.updateReply) vit sous l'API v4
//      historique (mybusiness.googleapis.com/v4) qui a longtemps exigé
//      une DEMANDE D'ACCÈS séparée auprès de Google (au-delà du simple
//      "Enable" dans la console) car elle donne un accès en écriture à
//      une fiche d'établissement — à vérifier au moment de la mise en
//      place, ce prérequis a pu évoluer.
//   3. Créer un identifiant OAuth 2.0 (type "Application Web") dans
//      Google Cloud Console > API et services > Identifiants.
//   4. Ajouter l'URI de redirection autorisée :
//      https://noveresto.app/api/v1/google-business/oauth/callback
//   5. Configurer l'écran de consentement OAuth avec le scope
//      https://www.googleapis.com/auth/business.manage — ce scope est
//      "sensible", Google exige une vérification de l'app (politique de
//      confidentialité publique, etc.) avant de fonctionner pour autre
//      chose que les comptes de test que vous listez vous-même. Peut
//      prendre plusieurs jours.
//   6. Renseigner GOOGLE_OAUTH_CLIENT_ID et GOOGLE_OAUTH_CLIENT_SECRET
//      dans .env une fois l'identifiant créé.
//
// Tant que ces variables sont absentes, ce module reste inerte : les
// fonctions d'appel renvoient une erreur explicite plutôt que de planter,
// et l'UI masque le bouton de connexion (cf. GET /google-business/config).

const jwt = require('jsonwebtoken');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'https://noveresto.app/api/v1/google-business/oauth/callback';
const JWT_SECRET = process.env.JWT_SECRET;
const SCOPE = 'https://www.googleapis.com/auth/business.manage';

function isConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

/**
 * URL de consentement Google. `state` encode le restaurant demandeur
 * (JWT signé, courte durée de vie) — Google nous le renvoie tel quel au
 * callback, seul moyen de savoir quel restaurant a initié la demande
 * puisque le navigateur ne porte pas notre Authorization header jusque
 * sur le redirect final de Google.
 */
function getAuthUrl(restaurantId) {
  const state = jwt.sign({ restaurantId, purpose: 'google_business_connect' }, JWT_SECRET, { expiresIn: '10m' });
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',  // necessaire pour obtenir un refresh_token
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function verifyState(state) {
  const decoded = jwt.verify(state, JWT_SECRET);
  if (decoded.purpose !== 'google_business_connect') throw new Error('state invalide');
  return decoded.restaurantId;
}

async function exchangeCodeForTokens(code) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Echange de code OAuth echoue: ${data.error_description || data.error}`);
  return data; // { access_token, refresh_token, expires_in, ... }
}

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Rafraichissement du token echoue: ${data.error_description || data.error}`);
  return data; // { access_token, expires_in, ... } — pas de nouveau refresh_token en general
}

/**
 * Renvoie un access_token valide pour ce restaurant, en le rafraichissant
 * d'abord si besoin (marge de 5 min). Met a jour la DB si rafraichi.
 */
async function getValidAccessToken(pool, restaurantId) {
  const { rows } = await pool.query(
    'SELECT access_token, refresh_token, token_expires_at FROM google_business_connections WHERE restaurant_id = $1 AND status = $2',
    [restaurantId, 'connected']
  );
  const conn = rows[0];
  if (!conn) {
    const err = new Error('Aucun compte Google Business Profile connecte pour ce restaurant');
    err.statusCode = 400;
    throw err;
  }
  const expiresInMs = new Date(conn.token_expires_at).getTime() - Date.now();
  if (expiresInMs > 5 * 60 * 1000) return conn.access_token;

  try {
    const refreshed = await refreshAccessToken(conn.refresh_token);
    const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000);
    await pool.query(
      'UPDATE google_business_connections SET access_token = $1, token_expires_at = $2, status = $3, updated_at = now() WHERE restaurant_id = $4',
      [refreshed.access_token, newExpiry, 'connected', restaurantId]
    );
    return refreshed.access_token;
  } catch (err) {
    await pool.query(
      "UPDATE google_business_connections SET status = 'expired', updated_at = now() WHERE restaurant_id = $1",
      [restaurantId]
    );
    throw err;
  }
}

async function fetchAccounts(accessToken) {
  const res = await fetch('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Liste des comptes Google Business echouee: ${data.error?.message || res.status}`);
  return data.accounts || [];
}

async function fetchLocations(accessToken, accountName) {
  const params = new URLSearchParams({ readMask: 'name,title' });
  const res = await fetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Liste des etablissements Google Business echouee: ${data.error?.message || res.status}`);
  return data.locations || [];
}

/**
 * Avis via l'API Business Profile (v4, "My Business API") — PAS la
 * Places API. Seuls ces avis portent un `name` (resource path complet)
 * utilisable ensuite pour publier une reponse.
 */
async function fetchReviewsViaBusinessProfile(accessToken, locationName) {
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${locationName}/reviews`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Recuperation des avis Business Profile echouee: ${data.error?.message || res.status}`);
  return data.reviews || [];
}

/**
 * Publie (ou remplace) la reponse a UN avis Google reel.
 * @param {string} reviewName - resource name complet, ex:
 *   "accounts/123/locations/456/reviews/AbCdEf..." (reviews.google_review_name)
 */
async function postReplyToGoogle(accessToken, reviewName, replyText) {
  const res = await fetch(`https://mybusiness.googleapis.com/v4/${reviewName}/reply`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment: replyText }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Publication de la reponse sur Google echouee: ${data.error?.message || res.status}`);
  return data;
}

module.exports = {
  isConfigured, getAuthUrl, verifyState, exchangeCodeForTokens, refreshAccessToken,
  getValidAccessToken, fetchAccounts, fetchLocations, fetchReviewsViaBusinessProfile, postReplyToGoogle,
};
