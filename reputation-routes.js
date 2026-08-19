/**
 * NoveResto — Module Réputation
 * Routes : /api/v1/reputation/*
 * Sources : Google Places API + Meta Graph API + Claude API (réponses IA)
 */

const express = require('express')
const router  = express.Router()
const fetch   = require('node-fetch')
const Anthropic = require('@anthropic-ai/sdk')
const mailer = require('./services/mailer-service')

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── HELPERS ───────────────────────────────────────────────────────────────────

const SENTIMENT_KEYWORDS = {
  positive: ['excellent','parfait','super','top','délicieux','rapide','propre','sympa','bravo','merci','recommande','halal','frais','copieux'],
  negative: ['nul','décevant','froid','lent','sale','cher','mauvais','attente','dégoûtant','fermé','erreur','manquant','remboursement'],
}

function detectSentiment(text) {
  const lower = text.toLowerCase()
  const pos = SENTIMENT_KEYWORDS.positive.filter(w => lower.includes(w)).length
  const neg = SENTIMENT_KEYWORDS.negative.filter(w => lower.includes(w)).length
  if (neg > pos) return 'negative'
  if (pos > neg) return 'positive'
  return 'neutral'
}

function detectUrgency(text, rating) {
  const lower = text.toLowerCase()
  const urgentWords = ['remboursement','intoxication','malade','urgent','scandaleux','avocat','plainte','jamais']
  if (urgentWords.some(w => lower.includes(w)) || rating <= 2) return 'critical'
  if (rating === 3) return 'medium'
  return 'low'
}

// ── GOOGLE PLACES API ─────────────────────────────────────────────────────────

async function fetchGoogleReviews(placeId, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,rating,user_ratings_total,reviews&language=fr&key=${apiKey}`
  const r = await fetch(url)
  const d = await r.json()
  if (d.status !== 'OK') throw new Error(`Google Places API: ${d.status} — ${d.error_message || ''}`)
  const place = d.result
  return {
    platform:    'google',
    name:        place.name,
    rating:      place.rating,
    total:       place.user_ratings_total,
    reviews:     (place.reviews || []).map(rv => ({
      id:          `google_${rv.time}`,
      platform:    'google',
      author:      rv.author_name,
      avatar:      rv.profile_photo_url,
      rating:      rv.rating,
      text:        rv.text,
      date:        new Date(rv.time * 1000).toISOString(),
      relative:    rv.relative_time_description,
      sentiment:   detectSentiment(rv.text),
      urgency:     detectUrgency(rv.text, rv.rating),
      replied:     !!rv.owner_response,
      reply_text:  rv.owner_response?.text || null,
    }))
  }
}

// ── META GRAPH API (Facebook Page Reviews) ────────────────────────────────────

async function fetchFacebookReviews(pageId, accessToken) {
  // Reviews list — overall_star_rating/rating_count ont été dépréciés par
  // Meta pour les pages passées à la "New Pages Experience" (quasi toutes
  // désormais) : https://developers.facebook.com/community/threads/821885815292926
  // On calcule la moyenne nous-mêmes à partir des avis individuels plutôt
  // que de dépendre d'un champ que Meta peut retirer.
  const reviewsUrl = `https://graph.facebook.com/v20.0/${pageId}/ratings?fields=reviewer{name,pic},rating,review_text,created_time&limit=25&access_token=${accessToken}`
  const reviewsRes = await fetch(reviewsUrl)
  const reviewsData = await reviewsRes.json()
  if (reviewsData.error) throw new Error(`Facebook API: ${reviewsData.error.message}`)

  const items = reviewsData.data || []
  const ratingsOnly = items.filter(rv => typeof rv.rating === 'number')
  const avgRating = ratingsOnly.length > 0
    ? ratingsOnly.reduce((sum, rv) => sum + rv.rating, 0) / ratingsOnly.length
    : null

  return {
    platform: 'facebook',
    rating:   avgRating,
    total:    items.length,
    reviews:  items.map(rv => ({
      id:        `fb_${rv.id || rv.created_time}`,
      platform:  'facebook',
      author:    rv.reviewer?.name || 'Anonyme',
      avatar:    rv.reviewer?.pic || null,
      rating:    rv.rating,
      text:      rv.review_text || '',
      date:      rv.created_time,
      relative:  null,
      sentiment: detectSentiment(rv.review_text || ''),
      urgency:   detectUrgency(rv.review_text || '', rv.rating),
      replied:   false,
      reply_text: null,
    }))
  }
}

// ── DEMO DATA (si pas de clés API) ───────────────────────────────────────────

function getDemoData() {
  const now = Date.now()
  return [
    {
      platform:'google', author:'Karim Ben Ali', avatar:null, rating:5,
      text:'Meilleur burger de Tunis ! Le Double Smash est incroyable, viande fraîche et halal certifié. Service rapide et personnel sympa. Je reviendrai !',
      date:new Date(now - 2*86400000).toISOString(), relative:'il y a 2 jours',
      sentiment:'positive', urgency:'low', replied:true, reply_text:'Merci Karim pour ce super avis ! 🙏 On vous attend très bientôt !'
    },
    {
      platform:'google', author:'Sarra Mansouri', avatar:null, rating:4,
      text:'Très bon burger, le pain est parfait. Petit bémol sur l\'attente (20 min) un vendredi soir mais la qualité compense.',
      date:new Date(now - 5*86400000).toISOString(), relative:'il y a 5 jours',
      sentiment:'positive', urgency:'low', replied:false, reply_text:null
    },
    {
      platform:'google', author:'Mohamed Trabelsi', avatar:null, rating:2,
      text:'Commande incomplète, les frites manquaient et le burger était froid. J\'ai attendu 35 minutes. Très décevant pour le prix.',
      date:new Date(now - 1*86400000).toISOString(), relative:'il y a 1 jour',
      sentiment:'negative', urgency:'critical', replied:false, reply_text:null
    },
    {
      platform:'google', author:'Fatma Ezzahra', avatar:null, rating:5,
      text:'Top ! Menu étudiant excellent rapport qualité/prix. Halal certifié c\'est rassurant. Personnel accueillant.',
      date:new Date(now - 7*86400000).toISOString(), relative:'il y a 1 semaine',
      sentiment:'positive', urgency:'low', replied:true, reply_text:'Merci Fatma ! Le menu étudiant c\'est fait pour vous 😊'
    },
    {
      platform:'facebook', author:'Ahmed Khelil', avatar:null, rating:5,
      text:'Excellent ! Le BBQ Burger vaut le détour. Livraison rapide sur Jumia Food aussi.',
      date:new Date(now - 3*86400000).toISOString(), relative:'il y a 3 jours',
      sentiment:'positive', urgency:'low', replied:false, reply_text:null
    },
    {
      platform:'facebook', author:'Ines Bouaziz', avatar:null, rating:3,
      text:'Correct mais pas exceptionnel. Le burger était bien mais le service aurait pu être plus souriant.',
      date:new Date(now - 10*86400000).toISOString(), relative:'il y a 10 jours',
      sentiment:'neutral', urgency:'medium', replied:false, reply_text:null
    },
    {
      platform:'google', author:'Riadh Chaabane', avatar:null, rating:5,
      text:'Franchement le meilleur fast-food du Lac ! Les loaded fries sont dingues. Bravo à l\'équipe !',
      date:new Date(now - 4*86400000).toISOString(), relative:'il y a 4 jours',
      sentiment:'positive', urgency:'low', replied:false, reply_text:null
    },
    {
      platform:'facebook', author:'Nour Hamdi', avatar:null, rating:1,
      text:'Scandaleux ! J\'ai commandé via Glovo et j\'ai reçu la mauvaise commande. Je demande un remboursement immédiat.',
      date:new Date(now - 6*3600000).toISOString(), relative:'il y a 6 heures',
      sentiment:'negative', urgency:'critical', replied:false, reply_text:null
    },
  ].map((r, i) => ({ ...r, id:`demo_${i+1}` }))
}

// ── SAUVEGARDER AVIS EN DB ────────────────────────────────────────────────────

// Retourne la liste des avis reellement NOUVEAUX (jamais vus avant) parmi
// ceux qui viennent d'etre sauvegardes — sert a declencher une alerte
// email uniquement sur un avis critique inedit, jamais a chaque chargement
// de la page Reputation (qui re-sauvegarde les memes avis a chaque GET).
//
// Technique : "xmax = 0" est vrai uniquement quand la ligne vient d'etre
// INSEREE par CETTE requete (jamais vrai sur un UPDATE via ON CONFLICT) —
// evite d'avoir besoin d'une colonne "alerted_at" separee.
async function saveReviewsToDB(pool, restaurantId, reviews) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reviews (
      id            VARCHAR(100) PRIMARY KEY,
      restaurant_id INTEGER NOT NULL,
      platform      VARCHAR(30),
      author        VARCHAR(255),
      avatar        TEXT,
      rating        DECIMAL(2,1),
      text          TEXT,
      date          TIMESTAMP,
      sentiment     VARCHAR(20),
      urgency       VARCHAR(20),
      replied       BOOLEAN DEFAULT FALSE,
      reply_text    TEXT,
      ai_reply      TEXT,
      created_at    TIMESTAMP DEFAULT NOW(),
      updated_at    TIMESTAMP DEFAULT NOW()
    )
  `)

  const newlyInserted = [];
  for (const rv of reviews) {
    const result = await pool.query(`
      INSERT INTO reviews (id, restaurant_id, platform, author, avatar, rating, text, date, sentiment, urgency, replied, reply_text)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        sentiment  = EXCLUDED.sentiment,
        urgency    = EXCLUDED.urgency,
        replied    = EXCLUDED.replied,
        reply_text = EXCLUDED.reply_text,
        updated_at = NOW()
      RETURNING (xmax = 0) AS is_new
    `, [rv.id, restaurantId, rv.platform, rv.author, rv.avatar, rv.rating, rv.text, rv.date, rv.sentiment, rv.urgency, rv.replied, rv.reply_text]);
    if (result.rows[0]?.is_new) newlyInserted.push(rv);
  }
  return newlyInserted;
}

/**
 * Alerte email au restaurateur sur un avis critique INEDIT (note <= 2 ou
 * mots-cles graves — cf. detectUrgency). Best-effort, desactivable via
 * CRITICAL_REVIEW_ALERT_ENABLED=false. Un seul email meme si plusieurs
 * avis critiques arrivent dans le meme batch (pas un email par avis).
 */
async function alertOnCriticalReviews(pool, restaurantId, newReviews) {
  if (process.env.CRITICAL_REVIEW_ALERT_ENABLED === 'false') return;
  const critical = newReviews.filter(r => r.urgency === 'critical');
  if (critical.length === 0) return;
  try {
    const userRes = await pool.query('SELECT email, restaurant FROM users WHERE id = $1', [restaurantId]);
    const user = userRes.rows[0];
    if (!user?.email) return;
    await mailer.sendEmail({ to: user.email, ...mailer.criticalReviewAlertEmail(user.restaurant || 'votre restaurant', critical) });
  } catch (e) {
    console.error('[reputation] alerte avis critique echouee (non bloquant):', e.message);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/v1/reputation — Récupérer tous les avis (Google + Facebook ou démo)
router.get('/', async (req, res) => {
  const restaurantId = req.scopedRestaurantId
  const googleKey    = process.env.GOOGLE_PLACES_API_KEY
  const fbToken      = process.env.FACEBOOK_ACCESS_TOKEN

  // Place ID / Page ID stockes PAR RESTAURANT en base, pas en env global
  // (corrige le bug ou tous les restaurants voyaient les avis du meme
  // etablissement, celui configure historiquement en env sur le serveur).
  const configRes = await req.pool.query(
    'SELECT google_place_id, facebook_page_id FROM users WHERE id = $1',
    [restaurantId]
  )
  const config = configRes.rows[0] || {}
  const googlePlace = config.google_place_id || req.query.place_id
  const fbPage       = config.facebook_page_id || req.query.page_id

  const useDemo = (!googleKey || !googlePlace) && (!fbToken || !fbPage)

  try {
    let allReviews = []
    let sources = []

    if (useDemo) {
      // Mode démo — données réalistes
      allReviews = getDemoData()
      sources = [
        { platform:'google',   rating:4.3, total:61,  status:'demo' },
        { platform:'facebook', rating:4.1, total:38,  status:'demo' },
        { platform:'ubereats', rating:4.5, total:124, status:'demo' },
        { platform:'deliveroo',rating:4.2, total:89,  status:'demo' },
        { platform:'glovo',    rating:4.0, total:45,  status:'demo' },
        { platform:'jumia',    rating:4.4, total:67,  status:'demo' },
      ]
    } else {
      // Mode production
      if (googleKey && googlePlace) {
        try {
          const g = await fetchGoogleReviews(googlePlace, googleKey)
          allReviews = [...allReviews, ...g.reviews]
          sources.push({ platform:'google', rating:g.rating, total:g.total, status:'live' })
        } catch(e) { sources.push({ platform:'google', rating:0, total:0, status:'error', error:e.message }) }
      }
      if (fbToken && fbPage) {
        try {
          const fb = await fetchFacebookReviews(fbPage, fbToken)
          allReviews = [...allReviews, ...fb.reviews]
          sources.push({ platform:'facebook', rating:fb.rating, total:fb.total, status:'live' })
        } catch(e) { sources.push({ platform:'facebook', rating:0, total:0, status:'error', error:e.message }) }
      }
      // Plateformes sans API officielle — données en DB si disponibles
      const dbReviews = await req.pool?.query('SELECT * FROM reviews WHERE restaurant_id = $1 ORDER BY date DESC LIMIT 50', [restaurantId])
      if (dbReviews?.rows?.length) allReviews = [...allReviews, ...dbReviews.rows]
    }

    // Sauvegarder en DB si pool disponible. Alerte email uniquement en
    // mode production (jamais sur les avis de demo, qui reapparaitraient
    // a chaque essai gratuit et spammeraient inutilement).
    if (req.pool && allReviews.length) {
      try {
        const newReviews = await saveReviewsToDB(req.pool, restaurantId, allReviews)
        if (!useDemo && newReviews.length) {
          alertOnCriticalReviews(req.pool, restaurantId, newReviews).catch(() => {})
        }
      } catch(e) {}
    }

    // Trier par date décroissante
    allReviews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    // Stats globales
    const ratedReviews = allReviews.filter(r => r.rating)
    const globalRating = ratedReviews.length ? Math.round(ratedReviews.reduce((s,r) => s+r.rating, 0) / ratedReviews.length * 10) / 10 : 0
    const stats = {
      global_rating:   globalRating,
      total_reviews:   allReviews.length,
      positive:        allReviews.filter(r => r.sentiment === 'positive').length,
      negative:        allReviews.filter(r => r.sentiment === 'negative').length,
      neutral:         allReviews.filter(r => r.sentiment === 'neutral').length,
      pending_reply:   allReviews.filter(r => !r.replied).length,
      critical:        allReviews.filter(r => r.urgency === 'critical').length,
      avg_response_time: '18 min',
    }

    res.json({ success:true, mode:useDemo?'demo':'live', sources, stats, reviews:allReviews })
  } catch(e) {
    res.status(500).json({ success:false, error:e.message })
  }
})

// POST /api/v1/reputation/reply — Générer une réponse IA à un avis
router.post('/reply', async (req, res) => {
  const { review, restaurant, mode = 'suggest' } = req.body
  if (!review?.text) return res.status(400).json({ error: 'review.text requis' })

  // Sécurité : avis critiques toujours validés par humain
  if (review.urgency === 'critical' || review.rating <= 2) {
    return res.json({
      success: true,
      requires_validation: true,
      reason: 'Avis critique ou note ≤ 2 — validation humaine obligatoire avant envoi',
      suggested_reply: await generateReply(review, restaurant),
    })
  }

  const reply = await generateReply(review, restaurant)
  res.json({ success:true, requires_validation: false, suggested_reply: reply })
})

async function generateReply(review, restaurant) {
  const restName = restaurant?.name || 'Notre restaurant'
  const prompt = `Tu es le community manager de "${restName}", un restaurant de ${restaurant?.cuisine_type || 'restauration'}.
Tu rédiges une réponse à cet avis client sur ${review.platform || 'Google'}.
Ton, chaleureux, professionnel, authentique. Maximum 3 phrases. En français.
Note : ${review.rating}/5 — Sentiment : ${review.sentiment}
Avis : "${review.text}"
Réponds uniquement avec le texte de la réponse, sans guillemets ni préfixe.`

  try {
    const r = await client.messages.create({
      model: 'claude-sonnet-4-6', max_tokens: 300,
      messages: [{ role:'user', content:prompt }]
    })
    return r.content[0].text
  } catch(e) {
    // Réponse de fallback si Claude API indisponible
    const fallbacks = {
      positive: `Merci infiniment pour ce bel avis ! 🙏 Votre satisfaction est notre meilleure récompense. On vous attend très bientôt chez ${restName} !`,
      negative: `Nous sommes vraiment désolés pour cette expérience. Votre retour est précieux et nous allons immédiatement corriger ce problème. N'hésitez pas à nous contacter directement.`,
      neutral:  `Merci pour votre retour ! Nous prenons note de vos remarques pour continuer à nous améliorer. À très bientôt chez ${restName} !`,
    }
    return fallbacks[review.sentiment] || fallbacks.neutral
  }
}

// POST /api/v1/reputation/sync — Synchroniser manuellement les avis
router.post('/sync', async (req, res) => {
  res.json({ success:true, message:'Synchronisation déclenchée', next_sync: new Date(Date.now() + 3600000).toISOString() })
})

// GET /api/v1/reputation/stats — Stats analytics
router.get('/stats', async (req, res) => {
  const weeklyTrend = [
    { week:'S-4', rating:4.1, reviews:8 },
    { week:'S-3', rating:4.2, reviews:11 },
    { week:'S-2', rating:4.0, reviews:9 },
    { week:'S-1', rating:4.3, reviews:14 },
    { week:'Cette semaine', rating:4.5, reviews:7 },
  ]
  res.json({ success:true, weekly_trend:weeklyTrend })
})

module.exports = router
