/**
 * NoveResto — Moteur Claude API Social Media IA
 * Version : 1.0.0
 * Fichier  : social-ai.js
 * 
 * Ce moteur gère :
 *   - Génération du calendrier éditorial mensuel
 *   - Génération des publications par plateforme (Facebook, Instagram, TikTok)
 *   - Analyse des performances et recommandations
 *   - Réponses aux commentaires
 *   - Stratégie éditoriale initiale
 */

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 4096;

// ── CONSTANTES ────────────────────────────────────────────────────────────────

const PLATFORMS = { FACEBOOK: 'facebook', INSTAGRAM: 'instagram', TIKTOK: 'tiktok' };

const CONTENT_TYPES = {
  POST:      'post',
  STORY:     'story',
  REEL:      'reel',
  VIDEO:     'video',
  CAROUSEL:  'carousel',
};

const THEMES = [
  'plat_signature',    // Mise en avant d'un plat phare
  'menu_jour',         // Menu du jour / Spécial du moment
  'coulisses',         // Behind the scenes, cuisine
  'equipe',            // Présentation équipe / chef
  'avis_client',       // Témoignage / avis client
  'promotion',         // Offre commerciale, promo
  'jeu_concours',      // Engagement / jeu
  'video_preparation', // Recette, préparation
  'offre_limitee',     // Urgence, offre flash
  'evenement',         // Événement local, fête
  'nouveaute',         // Nouveau plat / service
  'histoire',          // Histoire du restaurant
  'sondage',           // Question / interaction
  'communautaire',     // Contenu local, quartier
  'horaires',          // Rappel horaires, jours
  'livraison',         // Rappel services livraison
  'saisonnier',        // Contenu lié à la saison / Ramadan
];

const CONTENT_MIX = {
  notoriete:    0.25, // 25% — faire connaître
  engagement:   0.30, // 30% — interagir
  commercial:   0.25, // 25% — vendre
  fidelisation: 0.20, // 20% — fidéliser
};

// ── UTILITAIRES ───────────────────────────────────────────────────────────────

/**
 * Appel Claude API avec retry automatique
 */
async function callClaude(systemPrompt, userPrompt, maxTokens = MAX_TOKENS) {
  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });
      return response.content[0].text;
    } catch (error) {
      if (attempt === maxRetries) throw error;
      const delay = attempt * 2000;
      console.error(`Claude API attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

/**
 * Parse JSON proprement depuis la réponse Claude
 */
function parseJSON(text) {
  try {
    // Supprimer les backticks markdown si présents
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Impossible de parser la réponse Claude: ${e.message}\nRéponse: ${text.substring(0, 200)}`);
  }
}

/**
 * Construire le profil restaurant pour les prompts
 */
function buildRestaurantProfile(restaurant) {
  return `
## Profil du restaurant
- Nom : ${restaurant.name}
- Type de cuisine : ${restaurant.cuisine_type || 'Non spécifié'}
- Spécialités : ${restaurant.specialties || 'Non spécifié'}
- Adresse : ${restaurant.address || 'Non spécifié'}
- Ticket moyen : ${restaurant.avg_ticket} ${restaurant.currency || 'TND'}
- Clientèle cible : ${restaurant.target_audience || 'Grand public'}
- Tranche d'âge cible : ${restaurant.target_age || '18-45 ans'}
- Positionnement : ${restaurant.positioning || 'Standard'}
- Avantages différenciants : ${restaurant.differentiators || 'Non spécifié'}
- Halal : ${restaurant.is_halal ? 'Oui' : 'Non'}
- Livraison : ${restaurant.has_delivery ? 'Oui' : 'Non'}
- Réservation : ${restaurant.has_booking ? 'Oui' : 'Non'}
- Pays / marché : ${restaurant.country || 'Tunisie'}
- Langue de communication : ${restaurant.language || 'Français'}
- Plats les plus populaires : ${(restaurant.top_dishes || []).join(', ') || 'Non spécifié'}
- Plats les plus rentables : ${(restaurant.profitable_dishes || []).join(', ') || 'Non spécifié'}
- Jours creux : ${(restaurant.slow_days || []).join(', ') || 'Non spécifié'}
- Objectifs marketing : ${(restaurant.objectives || []).join(', ') || 'Augmenter les ventes'}
- Concurrents principaux : ${(restaurant.competitors || []).join(', ') || 'Non spécifié'}
`.trim();
}

// ── FONCTION 1 : STRATÉGIE ÉDITORIALE ─────────────────────────────────────────

/**
 * Génère la stratégie éditoriale initiale du restaurant
 * @param {Object} restaurant - Profil complet du restaurant
 * @returns {Object} Stratégie éditoriale structurée
 */
async function generateEditorialStrategy(restaurant) {
  const systemPrompt = `Tu es un expert en marketing digital pour les restaurants MENA (Tunisie, Maghreb, Afrique).
Tu génères des stratégies éditoriales percutantes, adaptées à la culture locale, au marché MENA et au contexte de chaque restaurant.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

Génère une stratégie éditoriale complète pour ce restaurant sur les réseaux sociaux.

Réponds en JSON avec cette structure exacte :
{
  "brand_voice": {
    "tone": "description du ton général (ex: chaleureux, authentique, premium)",
    "personality": "personnalité de la marque (3-5 adjectifs)",
    "do": ["liste de 5 choses à faire dans les publications"],
    "dont": ["liste de 5 choses à éviter"]
  },
  "content_pillars": [
    {
      "name": "nom du pilier",
      "percentage": 25,
      "description": "description",
      "examples": ["exemple 1", "exemple 2"]
    }
  ],
  "best_posting_times": {
    "facebook": ["horaire 1", "horaire 2"],
    "instagram": ["horaire 1", "horaire 2"],
    "tiktok": ["horaire 1", "horaire 2"]
  },
  "hashtag_strategy": {
    "brand": ["#hashtag_marque"],
    "local": ["#hashtag_local_1", "#hashtag_local_2"],
    "sector": ["#hashtag_secteur_1"],
    "trending": ["#hashtag_tendance_1"]
  },
  "seasonal_events": [
    {
      "event": "nom événement (Ramadan, Aïd, etc.)",
      "months": ["mois concernés"],
      "strategy": "stratégie spécifique"
    }
  ],
  "competitor_differentiation": "comment se différencier des concurrents sur les réseaux",
  "growth_objectives": {
    "month_1": "objectif mois 1",
    "month_3": "objectif mois 3",
    "month_6": "objectif mois 6"
  }
}`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return parseJSON(raw);
}

// ── FONCTION 2 : CALENDRIER ÉDITORIAL ─────────────────────────────────────────

/**
 * Génère le calendrier éditorial mensuel complet
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} options - Options du calendrier
 * @param {string} options.formula - essentielle | croissance | performance
 * @param {string} options.month - Format YYYY-MM
 * @param {Array}  options.platforms - Plateformes actives
 * @param {Object} options.strategy - Stratégie éditoriale (optionnel)
 * @returns {Array} Tableau de publications planifiées
 */
async function generateMonthlyCalendar(restaurant, options = {}) {
  const {
    formula = 'croissance',
    month = new Date().toISOString().slice(0, 7),
    platforms = ['facebook', 'instagram', 'tiktok'],
    strategy = null,
  } = options;

  // Nombre de publications selon la formule
  const postsPerWeek = {
    essentielle:  { total: 2, stories: 2, videos: 0 },
    croissance:   { total: 4, stories: 3, videos: 2 },
    performance:  { total: 6, stories: 5, videos: 4 },
  }[formula] || { total: 4, stories: 3, videos: 2 };

  // Calculer le nombre de semaines dans le mois
  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();
  const weeks = Math.ceil(daysInMonth / 7);
  const totalPosts = postsPerWeek.total * weeks;

  const systemPrompt = `Tu es un expert en community management et content marketing pour les restaurants.
Tu génères des calendriers éditoriaux détaillés, variés et adaptés au marché MENA (Tunisie, Maghreb).
Tes publications sont authentiques, engageantes et adaptées à chaque plateforme.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

## Paramètres du calendrier
- Mois : ${month}
- Formule : ${formula}
- Plateformes actives : ${platforms.join(', ')}
- Publications par semaine : ${postsPerWeek.total}
- Stories par semaine : ${postsPerWeek.stories}
- Vidéos par mois : ${postsPerWeek.videos * weeks}
- Total publications à générer : ${totalPosts}

${strategy ? `## Stratégie éditoriale
Ton de marque : ${strategy.brand_voice?.tone}
Piliers de contenu : ${strategy.content_pillars?.map(p => p.name).join(', ')}` : ''}

## Mix de contenu à respecter
- Notoriété : 25% des publications
- Engagement : 30% des publications  
- Commercial : 25% des publications
- Fidélisation : 20% des publications

## Règles importantes
- Ne jamais publier 2 promotions commerciales consécutives
- Varier les thèmes chaque semaine
- Adapter le ton et le format à chaque plateforme
- Intégrer les événements saisonniers locaux (Ramadan, Aïd, fêtes nationales tunisiennes)
- Privilégier les horaires à fort engagement selon la plateforme

Génère le calendrier éditorial complet pour le mois ${month}.

Réponds en JSON avec cette structure :
{
  "month": "${month}",
  "total_posts": ${totalPosts},
  "posts": [
    {
      "week": 1,
      "date": "YYYY-MM-DD",
      "time": "HH:MM",
      "platform": "facebook|instagram|tiktok",
      "content_type": "post|story|reel|video|carousel",
      "theme": "thème de la publication",
      "objective": "notoriete|engagement|commercial|fidelisation",
      "title": "titre court de la publication",
      "caption_hook": "accroche forte (première ligne)",
      "caption_body": "corps du texte adapté à la plateforme",
      "cta": "appel à l'action clair",
      "hashtags": ["#hashtag1", "#hashtag2"],
      "visual_suggestion": "description du visuel/vidéo recommandé",
      "is_sponsored": false,
      "estimated_reach": "estimation portée organique",
      "notes": "notes supplémentaires pour l'équipe"
    }
  ]
}`;

  const raw = await callClaude(systemPrompt, userPrompt, 8192);
  const result = parseJSON(raw);

  // Enrichir avec les métadonnées
  result.restaurant_id = restaurant.id;
  result.formula = formula;
  result.platforms = platforms;
  result.generated_at = new Date().toISOString();

  return result;
}

// ── FONCTION 3 : GÉNÉRATION PUBLICATION INDIVIDUELLE ─────────────────────────

/**
 * Génère une publication complète pour une plateforme spécifique
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} postSpec - Spécification de la publication
 * @returns {Object} Publication complète et prête à valider
 */
async function generatePost(restaurant, postSpec) {
  const {
    platform,
    theme,
    objective,
    content_type = 'post',
    dish = null,        // Plat spécifique à mettre en avant
    promotion = null,   // Promotion à communiquer
    event = null,       // Événement spécial
    tone_override = null,
  } = postSpec;

  const platformGuidelines = {
    facebook: `
- Longueur : 100-250 mots
- Ton : conversationnel, communautaire, storytelling
- Emoji : 3-5 maximum
- Favoriser les questions pour l'engagement
- Mentionner la localisation géographique
- CTA : "Réservez", "Commandez", "Venez nous voir"`,

    instagram: `
- Longueur : 80-150 mots + hashtags
- Ton : visuel, inspirant, lifestyle
- Emoji : 5-10, intégrés naturellement
- Hashtags : 15-25, mélange local/sectoriel/tendance
- Première ligne = accroche ultra-forte (visible avant "plus")
- CTA : "Lien en bio", "Story swipe up", "Taguez un ami"`,

    tiktok: `
- Longueur : 30-80 mots maximum
- Ton : authentique, dynamique, fun, humain
- Première phrase = hook choc (3 premières secondes)
- Favoriser les questions et challenges
- Hashtags : 5-8 tendance + 2-3 locaux
- CTA : "Suivez pour plus", "Dites-nous en commentaire", "Venez tester"
- Mentionner des tendances TikTok pertinentes si possible`,
  };

  const systemPrompt = `Tu es un expert en création de contenu pour les réseaux sociaux des restaurants MENA.
Tu crées des publications authentiques, engageantes et adaptées à chaque plateforme.
Tu connais parfaitement les codes culturels tunisiens et maghrébins.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

## Publication à créer
- Plateforme : ${platform}
- Thème : ${theme}
- Objectif : ${objective}
- Format : ${content_type}
${dish ? `- Plat mis en avant : ${dish}` : ''}
${promotion ? `- Promotion à communiquer : ${promotion}` : ''}
${event ? `- Événement : ${event}` : ''}
${tone_override ? `- Ton spécifique : ${tone_override}` : ''}

## Directives plateforme
${platformGuidelines[platform] || platformGuidelines.facebook}

Génère la publication complète en JSON :
{
  "platform": "${platform}",
  "content_type": "${content_type}",
  "theme": "${theme}",
  "objective": "${objective}",
  "caption_hook": "accroche première ligne (max 10 mots, doit donner envie de lire la suite)",
  "caption_body": "corps du texte complet avec emojis adaptés à la plateforme",
  "caption_full": "texte complet assemblé prêt à copier-coller",
  "cta": "appel à l'action",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "visual_suggestion": {
    "type": "photo|video|carousel|story",
    "description": "description détaillée du visuel à créer ou prendre",
    "composition": "conseils de cadrage et composition",
    "style": "style visuel recommandé"
  },
  "facebook_variant": "version adaptée Facebook si différente",
  "instagram_variant": "version adaptée Instagram si différente",
  "tiktok_script": "script détaillé pour TikTok (si applicable)",
  "best_time": "meilleur horaire de publication pour cette plateforme",
  "estimated_engagement": "estimation du niveau d'engagement attendu",
  "ab_test_variant": "variante A/B optionnelle pour tester"
}`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return parseJSON(raw);
}

// ── FONCTION 4 : GÉNÉRATION MULTI-PLATEFORMES ─────────────────────────────────

/**
 * Génère une publication adaptée pour toutes les plateformes actives
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} baseSpec - Spécification de base
 * @param {Array}  platforms - Plateformes cibles
 * @returns {Object} Publications par plateforme
 */
async function generateMultiPlatformPost(restaurant, baseSpec, platforms = ['facebook', 'instagram', 'tiktok']) {
  const results = {};

  // Générer en parallèle pour toutes les plateformes
  const promises = platforms.map(async (platform) => {
    const post = await generatePost(restaurant, { ...baseSpec, platform });
    results[platform] = post;
  });

  await Promise.all(promises);
  return results;
}

// ── FONCTION 5 : ANALYSE DE PERFORMANCES ──────────────────────────────────────

/**
 * Analyse les performances des publications et génère des recommandations
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} analytics - Données analytics collectées
 * @param {string} period - weekly | monthly
 * @returns {Object} Rapport d'analyse avec recommandations
 */
async function analyzePerformance(restaurant, analytics, period = 'weekly') {
  const systemPrompt = `Tu es un expert en analytics social media pour les restaurants.
Tu analyses les données de performance et fournis des recommandations actionnables et précises.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

## Données de performance — Période : ${period}
${JSON.stringify(analytics, null, 2)}

Génère un rapport d'analyse complet en JSON :
{
  "period": "${period}",
  "summary": {
    "total_reach": 0,
    "total_impressions": 0,
    "total_engagement": 0,
    "avg_engagement_rate": "0%",
    "new_followers": 0,
    "best_platform": "plateforme la plus performante",
    "overall_score": "0-10"
  },
  "top_posts": [
    {
      "post_id": "id",
      "platform": "plateforme",
      "theme": "thème",
      "reach": 0,
      "engagement_rate": "0%",
      "why_it_worked": "explication courte"
    }
  ],
  "underperforming_posts": [
    {
      "post_id": "id",
      "platform": "plateforme",
      "issue": "problème identifié",
      "fix": "correction recommandée"
    }
  ],
  "insights": [
    "insight clé 1",
    "insight clé 2",
    "insight clé 3"
  ],
  "best_times": {
    "facebook": "meilleur horaire découvert",
    "instagram": "meilleur horaire découvert",
    "tiktok": "meilleur horaire découvert"
  },
  "content_recommendations": [
    {
      "action": "action à prendre",
      "priority": "haute|moyenne|faible",
      "expected_impact": "impact attendu"
    }
  ],
  "next_period_strategy": "stratégie recommandée pour la prochaine période",
  "alert": "alerte critique si applicable (sinon null)"
}`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return parseJSON(raw);
}

// ── FONCTION 6 : RÉPONSE AUX COMMENTAIRES ─────────────────────────────────────

/**
 * Génère une réponse à un commentaire / message
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} comment - Commentaire reçu
 * @returns {Object} Réponse et classification
 */
async function generateCommentReply(restaurant, comment) {
  const {
    platform,
    text,
    author,
    sentiment = 'neutral', // positive | negative | neutral | urgent
    context = null,
  } = comment;

  const systemPrompt = `Tu es le community manager d'un restaurant. Tu réponds aux commentaires avec le ton exact du restaurant.
Tu identifies si un commentaire nécessite une validation humaine ou peut être traité automatiquement.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

## Commentaire reçu
- Plateforme : ${platform}
- Auteur : ${author}
- Texte : "${text}"
- Sentiment : ${sentiment}
${context ? `- Contexte : ${context}` : ''}

## Règles de validation humaine OBLIGATOIRE
Les commentaires suivants nécessitent TOUJOURS une validation humaine :
- Litiges, accusation, plainte sérieuse
- Demande de remboursement
- Problème sanitaire ou alimentaire
- Menace ou harcèlement
- Commentaire fortement négatif (1-2 étoiles)
- Problème juridique
- Sujet politique ou religieux

Génère la réponse en JSON :
{
  "requires_human_validation": true/false,
  "validation_reason": "raison si validation requise (sinon null)",
  "urgency_level": "low|medium|high|critical",
  "classification": "question|compliment|complaint|suggestion|spam|sensitive",
  "auto_reply": {
    "enabled": true/false,
    "text": "texte de la réponse automatique",
    "tone": "ton utilisé"
  },
  "suggested_reply": "réponse suggérée pour validation humaine (toujours fournie)",
  "internal_note": "note interne pour l'équipe du restaurant",
  "followup_action": "action de suivi recommandée si applicable"
}`;

  const raw = await callClaude(systemPrompt, userPrompt, 1024);
  return parseJSON(raw);
}

// ── FONCTION 7 : GÉNÉRATION CAMPAGNE PUBLICITAIRE ─────────────────────────────

/**
 * Génère la proposition de campagne publicitaire
 * @param {Object} restaurant - Profil du restaurant
 * @param {Object} campaignSpec - Spécifications de la campagne
 * @returns {Object} Proposition complète avec récapitulatif de validation
 */
async function generateAdCampaign(restaurant, campaignSpec) {
  const {
    objective,
    budget_total,
    budget_daily,
    start_date,
    end_date,
    platform,
    offer,
    target_radius_km = 5,
  } = campaignSpec;

  const systemPrompt = `Tu es un expert en publicité digitale pour les restaurants (Meta Ads, TikTok Ads).
Tu génères des propositions de campagnes précises et réalistes.
Tu indiques toujours clairement ce qui nécessite une validation humaine.
Tu réponds UNIQUEMENT en JSON valide, sans markdown, sans commentaires.`;

  const userPrompt = `
${buildRestaurantProfile(restaurant)}

## Paramètres de la campagne
- Objectif : ${objective}
- Budget total maximum : ${budget_total} ${restaurant.currency || 'TND'}
- Budget quotidien : ${budget_daily} ${restaurant.currency || 'TND'}
- Dates : du ${start_date} au ${end_date}
- Plateforme : ${platform}
- Offre à promouvoir : ${offer}
- Rayon géographique : ${target_radius_km} km autour du restaurant

Génère la proposition de campagne complète en JSON :
{
  "campaign_summary": {
    "name": "nom de la campagne",
    "platform": "${platform}",
    "objective": "${objective}",
    "start_date": "${start_date}",
    "end_date": "${end_date}",
    "duration_days": 0,
    "budget_total_max": ${budget_total},
    "budget_daily": ${budget_daily},
    "currency": "${restaurant.currency || 'TND'}"
  },
  "audience": {
    "age_min": 18,
    "age_max": 45,
    "radius_km": ${target_radius_km},
    "interests": ["intérêt 1", "intérêt 2"],
    "behaviors": ["comportement 1"],
    "exclusions": ["exclusion 1"]
  },
  "creative": {
    "headline": "titre principal de l'annonce",
    "primary_text": "texte principal",
    "description": "description courte",
    "cta_button": "BOOK_NOW|ORDER_NOW|LEARN_MORE|CALL_NOW",
    "visual_recommendation": "description du visuel recommandé"
  },
  "estimated_results": {
    "reach": "estimation portée",
    "impressions": "estimation impressions",
    "clicks": "estimation clics",
    "cost_per_click": "estimation CPC",
    "cost_per_1000": "estimation CPM"
  },
  "validation_required": true,
  "validation_statement": "Je valide le lancement de cette campagne avec un budget maximum de X TND/EUR",
  "risks": ["risque 1", "risque 2"],
  "optimization_rules": [
    "règle d'optimisation automatique 1",
    "règle d'optimisation automatique 2"
  ]
}`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return parseJSON(raw);
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

module.exports = {
  // Fonctions principales
  generateEditorialStrategy,
  generateMonthlyCalendar,
  generatePost,
  generateMultiPlatformPost,
  analyzePerformance,
  generateCommentReply,
  generateAdCampaign,

  // Utilitaires
  buildRestaurantProfile,
  parseJSON,
  callClaude,

  // Constantes
  PLATFORMS,
  CONTENT_TYPES,
  THEMES,
  CONTENT_MIX,
};
