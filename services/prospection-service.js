// prospection-service.js
//
// Utilise la même famille d'API Google Places que le module Réputation
// (maps.googleapis.com/maps/api/place/*, PAS places.googleapis.com "New")
// — cf. reputation-routes.js:fetchGoogleReviews(). Choix délibéré : cette
// API est déjà activée et fonctionnelle sur la clé GOOGLE_PLACES_API_KEY
// existante, contrairement à la nouvelle API qui nécessite une activation
// séparée sur Google Cloud Console.
//
// ⚠️ Non testable en sandbox : places.googleapis.com et maps.googleapis.com
// ne sont pas dans la liste des domaines réseau autorisés de mon
// environnement de développement. Cette limite est plus stricte que pour
// le Copilote IA (où j'avais pu au moins tester la connectivité avec une
// fausse clé) — ici je ne peux littéralement pas atteindre le réseau
// Google. Le format de requête ci-dessous suit la documentation officielle
// stable de l'API Places (legacy), mais DOIT être validé sur le serveur
// avant intégration complète — voir la commande curl fournie dans
// GIT_WORKFLOW.md.

const fetch = require('node-fetch');
const { logAction } = require('./audit-log-service');

/**
 * Calcule le palier d'opportunité selon la présence digitale du commerce.
 * Reprend la logique déjà utilisée dans NoverProspect (pondération forte
 * sur l'absence de site web et le faible nombre d'avis).
 */
function computeOpportunityTier({ hasWebsite, reviewCount }) {
  const count = reviewCount || 0;
  if (!hasWebsite && count < 20) return 'invisible';
  if (!hasWebsite && count >= 20) return 'presence_faible';
  if (hasWebsite && count < 20) return 'presence_faible';
  return 'etabli';
}

// Nearby Search utilise un enum fixe pour `type` (contrairement à Text
// Search qui accepte du texte libre) — mapping vers les valeurs Google les
// plus proches, avec un `keyword` en complément pour affiner quand le type
// exact n'existe pas côté Google (ex: "pizzeria", "salon de thé").
const CATEGORY_TO_GOOGLE_TYPE = {
  'restaurant':     { type: 'restaurant', keyword: null },
  'café':           { type: 'cafe', keyword: null },
  'fast food':      { type: 'meal_takeaway', keyword: null },
  'pizzeria':       { type: 'restaurant', keyword: 'pizza' },
  'boulangerie':    { type: 'bakery', keyword: null },
  'salon de thé':   { type: 'cafe', keyword: 'salon de thé' },
};

async function fetchPlaceDetails(placeId, apiKey) {
  const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,website,rating,user_ratings_total,formatted_address,geometry&language=fr&key=${apiKey}`;
  const detailRes = await fetch(detailUrl);
  const detailData = await detailRes.json();
  return detailData.result || {};
}

async function enrichResults(results, apiKey) {
  const detailed = [];
  for (const place of results) {
    try {
      const d = await fetchPlaceDetails(place.place_id, apiKey);
      detailed.push({
        google_place_id: place.place_id,
        name: d.name || place.name,
        address: d.formatted_address || place.formatted_address || place.vicinity,
        phone: d.formatted_phone_number || null,
        website: d.website || null,
        rating: d.rating ?? place.rating ?? null,
        review_count: d.user_ratings_total ?? place.user_ratings_total ?? 0,
        latitude: d.geometry?.location?.lat ?? place.geometry?.location?.lat ?? null,
        longitude: d.geometry?.location?.lng ?? place.geometry?.location?.lng ?? null,
      });
    } catch (e) {
      detailed.push({
        google_place_id: place.place_id,
        name: place.name,
        address: place.formatted_address || place.vicinity,
        phone: null,
        website: null,
        rating: place.rating ?? null,
        review_count: place.user_ratings_total ?? 0,
        latitude: place.geometry?.location?.lat ?? null,
        longitude: place.geometry?.location?.lng ?? null,
      });
    }
  }
  return detailed;
}

/**
 * Recherche des commerces via l'API Places (Text Search), puis récupère
 * téléphone/site web pour chaque résultat via Place Details (même pattern
 * que fetchGoogleReviews). Limite à 20 résultats par recherche (une page
 * Text Search) pour contenir le coût en appels API.
 */
async function searchPlaces(zoneLabel, category, apiKey) {
  const query = encodeURIComponent(`${category} ${zoneLabel}`);
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=fr&region=tn&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API: ${searchData.status} — ${searchData.error_message || ''}`);
  }

  const results = (searchData.results || []).slice(0, 20);
  return enrichResults(results, apiKey);
}

/**
 * Recherche des commerces autour d'un point précis (sélection carte) via
 * Nearby Search — plus précis qu'une recherche textuelle par nom de ville.
 */
async function searchPlacesNearby(lat, lng, radiusMeters, category, apiKey) {
  const mapping = CATEGORY_TO_GOOGLE_TYPE[category] || { type: 'restaurant', keyword: category };
  let searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radiusMeters}&type=${mapping.type}&language=fr&key=${apiKey}`;
  if (mapping.keyword) {
    searchUrl += `&keyword=${encodeURIComponent(mapping.keyword)}`;
  }

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
    throw new Error(`Google Places API: ${searchData.status} — ${searchData.error_message || ''}`);
  }

  const results = (searchData.results || []).slice(0, 20);
  return enrichResults(results, apiKey);
}

/**
 * Lance une recherche et enregistre (ou met à jour) les prospects trouvés.
 * Deux modes : { zoneLabel, category } pour une recherche textuelle, ou
 * { latitude, longitude, radiusKm, category, zoneLabel } pour une recherche
 * autour d'un point choisi sur la carte (zoneLabel sert alors uniquement
 * de libellé d'affichage, composé côté frontend).
 */
async function searchAndSaveProspects(pool, restaurantId, { zoneLabel, category, userId, latitude, longitude, radiusKm }) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const err = new Error('Recherche de prospects non configurée (clé Google Places manquante)');
    err.statusCode = 503;
    throw err;
  }

  const isNearbyMode = latitude !== undefined && longitude !== undefined;
  const places = isNearbyMode
    ? await searchPlacesNearby(latitude, longitude, (radiusKm || 3) * 1000, category, apiKey)
    : await searchPlaces(zoneLabel, category, apiKey);
  const saved = [];

  for (const p of places) {
    const hasWebsite = !!p.website;
    const tier = computeOpportunityTier({ hasWebsite, reviewCount: p.review_count });

    const result = await pool.query(
      `INSERT INTO prospects
        (restaurant_id, google_place_id, name, address, phone, website, rating, review_count,
         latitude, longitude, category, zone_label, opportunity_tier)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (restaurant_id, google_place_id) DO UPDATE SET
         name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone,
         website = EXCLUDED.website, rating = EXCLUDED.rating, review_count = EXCLUDED.review_count,
         opportunity_tier = EXCLUDED.opportunity_tier
       RETURNING *`,
      [restaurantId, p.google_place_id, p.name, p.address, p.phone, p.website, p.rating,
       p.review_count, p.latitude, p.longitude, category, zoneLabel, tier]
    );
    saved.push(result.rows[0]);
  }

  await logAction(pool, {
    restaurantId, userId,
    action: 'prospection.search',
    entityType: 'prospection_search',
    entityId: null,
    details: { zone_label: zoneLabel, category, results_count: saved.length }
  });

  return saved;
}

async function listProspects(pool, restaurantId, { tier, status } = {}) {
  const conditions = ['restaurant_id = $1'];
  const params = [restaurantId];
  let idx = 2;
  if (tier) { conditions.push(`opportunity_tier = $${idx++}`); params.push(tier); }
  if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

  const result = await pool.query(
    `SELECT * FROM prospects WHERE ${conditions.join(' AND ')} ORDER BY
       CASE opportunity_tier WHEN 'invisible' THEN 0 WHEN 'presence_faible' THEN 1 ELSE 2 END,
       review_count ASC`,
    params
  );
  return result.rows;
}

async function updateProspectStatus(pool, id, restaurantId, { status, notes }) {
  const updates = [];
  const params = [];
  let idx = 1;
  if (status !== undefined) { updates.push(`status = $${idx++}`); params.push(status); }
  if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
  if (updates.length === 0) {
    const err = new Error('Aucun champ à mettre à jour');
    err.statusCode = 400;
    throw err;
  }
  params.push(id, restaurantId);
  const result = await pool.query(
    `UPDATE prospects SET ${updates.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`,
    params
  );
  if (result.rows.length === 0) {
    const err = new Error('Prospect introuvable');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

module.exports = { computeOpportunityTier, searchPlaces, searchAndSaveProspects, listProspects, updateProspectStatus };
