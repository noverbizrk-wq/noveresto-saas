// public-diagnostic-service.js
//
// Outil marketing public (non authentifié) : un restaurateur tape le nom
// de son établissement + sa ville, reçoit gratuitement son score de
// visibilité digitale. Réutilise le moteur de scoring déjà construit dans
// le module Prospection (services/prospection-service.js), retourné vers
// l'extérieur comme aimant à prospects — inspiré du "diagnostic gratuit"
// de Malou identifié dans l'étude de marché.
//
// Aucune donnée n'est enregistrée en base : c'est un outil à usage unique,
// pas un système de suivi (contrairement aux prospects du module interne).

const fetch = require('node-fetch');
const { computeOpportunityTier } = require('./prospection-service');

const TIER_MESSAGES = {
  invisible: {
    title: 'Votre établissement est peu visible en ligne',
    body: "Sans site web et avec peu d'avis clients, une grande partie de vos clients potentiels ne vous trouve tout simplement pas avant de choisir un concurrent. C'est la situation où l'amélioration de votre présence digitale a le plus d'impact immédiat sur votre chiffre d'affaires.",
  },
  presence_faible: {
    title: 'Votre présence en ligne est incomplète',
    body: "Vous avez une base (avis, ou un site), mais des éléments clés manquent encore pour être pleinement compétitif face aux établissements voisins. Quelques actions ciblées peuvent nettement améliorer votre visibilité.",
  },
  etabli: {
    title: 'Votre présence en ligne est déjà solide',
    body: "Vous avez un site web et une base d'avis clients établie — la priorité maintenant est de maintenir cette avance et d'optimiser la conversion (réponses aux avis, fraîcheur des informations, réseaux sociaux actifs).",
  },
};

/**
 * Recherche UN établissement précis (nom + ville), contrairement à
 * searchPlaces() qui recherche une catégorie sur toute une zone. Ne
 * retourne que le premier résultat pertinent.
 */
async function findSingleBusiness(businessName, city, apiKey) {
  const query = encodeURIComponent(`${businessName} ${city}`);
  const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&language=fr&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (searchData.status === 'ZERO_RESULTS' || !searchData.results || searchData.results.length === 0) {
    const err = new Error('Établissement introuvable — vérifiez le nom et la ville');
    err.statusCode = 404;
    throw err;
  }
  if (searchData.status !== 'OK') {
    throw new Error(`Google Places API: ${searchData.status} — ${searchData.error_message || ''}`);
  }

  const place = searchData.results[0];
  const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,website,rating,user_ratings_total&language=fr&key=${apiKey}`;
  const detailRes = await fetch(detailUrl);
  const detailData = await detailRes.json();
  const d = detailData.result || {};

  return {
    name: d.name || place.name,
    address: d.formatted_address || place.formatted_address,
    website: d.website || null,
    rating: d.rating ?? place.rating ?? null,
    review_count: d.user_ratings_total ?? place.user_ratings_total ?? 0,
  };
}

async function runDiagnostic(businessName, city) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    const err = new Error('Diagnostic non configuré (clé Google Places manquante)');
    err.statusCode = 503;
    throw err;
  }

  const business = await findSingleBusiness(businessName, city, apiKey);
  const hasWebsite = !!business.website;
  const tier = computeOpportunityTier({ hasWebsite, reviewCount: business.review_count });
  const message = TIER_MESSAGES[tier];

  const recommendations = [];
  if (!hasWebsite) recommendations.push("Créer une présence web (site ou page dédiée) pour être trouvé par les clients qui cherchent en ligne.");
  if (business.review_count < 20) recommendations.push("Encourager activement vos clients satisfaits à laisser un avis Google — c'est le facteur le plus déterminant pour votre classement local.");
  if (business.rating && business.rating < 4.0) recommendations.push("Répondre systématiquement aux avis, en particulier négatifs, pour montrer votre réactivité aux futurs clients.");
  if (recommendations.length === 0) recommendations.push("Continuer à répondre régulièrement aux avis et publier sur les réseaux sociaux pour maintenir votre avance.");

  return {
    name: business.name,
    address: business.address,
    has_website: hasWebsite,
    rating: business.rating,
    review_count: business.review_count,
    opportunity_tier: tier,
    tier_title: message.title,
    tier_body: message.body,
    recommendations,
  };
}

module.exports = { runDiagnostic };
