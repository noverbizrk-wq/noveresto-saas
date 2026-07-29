/**
 * NoveResto — Tests du moteur Social Media IA
 * Fichier : social-ai.test.js
 * 
 * Lance avec : node social-ai.test.js
 * Nécessite : ANTHROPIC_API_KEY dans les variables d'environnement
 */

const socialAI = require('./social-ai');

// Restaurant de test — Burger House Tunis
const TEST_RESTAURANT = {
  id: 1,
  name: 'Burger House',
  cuisine_type: 'Burgers halal premium',
  specialties: 'Double Smash Burger, Crispy Chicken, Loaded Fries',
  address: 'Lac Tunis, Tunis',
  avg_ticket: 50,
  currency: 'TND',
  target_audience: 'Cadres et étudiants du Lac Tunis',
  target_age: '18-35 ans',
  positioning: 'Premium halal accessible',
  differentiators: 'Viande fraîche locale, halal certifié, service rapide',
  is_halal: true,
  has_delivery: true,
  has_booking: false,
  country: 'Tunisie',
  language: 'Français',
  top_dishes: ['Double Smash', 'Crispy Chicken', 'BBQ Burger'],
  profitable_dishes: ['Double Smash', 'Loaded Fries'],
  slow_days: ['Lundi', 'Mardi midi'],
  objectives: ['Augmenter les commandes midi', 'Développer la notoriété locale'],
  competitors: ['McDonald\'s Lac', 'Burger King Tunis', 'Kaya Burger'],
};

// Couleurs console
const OK = '\x1b[32m✅\x1b[0m';
const ERR = '\x1b[31m❌\x1b[0m';
const INFO = '\x1b[36mℹ️\x1b[0m';
const WARN = '\x1b[33m⚠️\x1b[0m';

async function runTest(name, fn) {
  process.stdout.write(`${INFO} Test: ${name}... `);
  const start = Date.now();
  try {
    const result = await fn();
    const ms = Date.now() - start;
    console.log(`${OK} OK (${ms}ms)`);
    return result;
  } catch (e) {
    console.log(`${ERR} FAILED: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('\n════════════════════════════════════════');
  console.log('  NoveResto — Social Media AI Engine Tests');
  console.log('════════════════════════════════════════\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log(`${ERR} ANTHROPIC_API_KEY manquant dans les variables d'environnement`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  // ── TEST 1 : Stratégie éditoriale ─────────────────────────────────────────
  const strategy = await runTest('Génération stratégie éditoriale', async () => {
    const result = await socialAI.generateEditorialStrategy(TEST_RESTAURANT);
    if (!result.brand_voice) throw new Error('brand_voice manquant');
    if (!result.content_pillars?.length) throw new Error('content_pillars manquant');
    if (!result.hashtag_strategy) throw new Error('hashtag_strategy manquant');
    console.log(`\n     Ton de marque: ${result.brand_voice.tone}`);
    console.log(`     Piliers: ${result.content_pillars.map(p => p.name).join(', ')}`);
    return result;
  });
  strategy ? passed++ : failed++;

  // ── TEST 2 : Calendrier mensuel ───────────────────────────────────────────
  const calendar = await runTest('Génération calendrier mensuel (croissance)', async () => {
    const result = await socialAI.generateMonthlyCalendar(TEST_RESTAURANT, {
      formula: 'croissance',
      month: '2026-08',
      platforms: ['facebook', 'instagram', 'tiktok'],
    });
    if (!result.posts?.length) throw new Error('Aucune publication générée');
    console.log(`\n     Publications générées: ${result.posts.length}`);
    console.log(`     Exemple: "${result.posts[0]?.caption_hook}"`);
    return result;
  });
  calendar ? passed++ : failed++;

  // ── TEST 3 : Publication Facebook ─────────────────────────────────────────
  const fbPost = await runTest('Génération publication Facebook', async () => {
    const result = await socialAI.generatePost(TEST_RESTAURANT, {
      platform: 'facebook',
      theme: 'plat_signature',
      objective: 'commercial',
      dish: 'Double Smash Burger',
    });
    if (!result.caption_full) throw new Error('caption_full manquant');
    if (!result.hashtags?.length) throw new Error('hashtags manquants');
    console.log(`\n     Accroche: "${result.caption_hook}"`);
    console.log(`     Hashtags: ${result.hashtags.slice(0,3).join(' ')}`);
    return result;
  });
  fbPost ? passed++ : failed++;

  // ── TEST 4 : Publication Instagram ────────────────────────────────────────
  const igPost = await runTest('Génération publication Instagram', async () => {
    const result = await socialAI.generatePost(TEST_RESTAURANT, {
      platform: 'instagram',
      theme: 'coulisses',
      objective: 'engagement',
      content_type: 'reel',
    });
    if (!result.caption_full) throw new Error('caption_full manquant');
    console.log(`\n     Accroche: "${result.caption_hook}"`);
    return result;
  });
  igPost ? passed++ : failed++;

  // ── TEST 5 : Publication TikTok ───────────────────────────────────────────
  const ttPost = await runTest('Génération publication TikTok', async () => {
    const result = await socialAI.generatePost(TEST_RESTAURANT, {
      platform: 'tiktok',
      theme: 'video_preparation',
      objective: 'notoriete',
      content_type: 'video',
    });
    if (!result.caption_full) throw new Error('caption_full manquant');
    console.log(`\n     Script TikTok disponible: ${!!result.tiktok_script}`);
    return result;
  });
  ttPost ? passed++ : failed++;

  // ── TEST 6 : Analyse performances ────────────────────────────────────────
  const analytics = await runTest('Analyse de performances', async () => {
    const mockAnalytics = {
      posts: [
        { id: 1, platform: 'instagram', theme: 'plat_signature', reach: 2847, engagement_rate: 8.2, likes: 187, comments: 23 },
        { id: 2, platform: 'facebook', theme: 'promotion', reach: 1200, engagement_rate: 3.1, likes: 45, comments: 8 },
        { id: 3, platform: 'tiktok', theme: 'coulisses', reach: 4500, engagement_rate: 12.4, likes: 412, comments: 67 },
      ],
      new_followers: { facebook: 12, instagram: 28, tiktok: 45 },
      period_start: '2026-07-21',
      period_end: '2026-07-27',
    };
    const result = await socialAI.analyzePerformance(TEST_RESTAURANT, mockAnalytics, 'weekly');
    if (!result.summary) throw new Error('summary manquant');
    if (!result.content_recommendations?.length) throw new Error('recommendations manquantes');
    console.log(`\n     Score global: ${result.summary.overall_score}/10`);
    console.log(`     Meilleure plateforme: ${result.summary.best_platform}`);
    return result;
  });
  analytics ? passed++ : failed++;

  // ── TEST 7 : Réponse commentaire positif ─────────────────────────────────
  const posReply = await runTest('Réponse commentaire positif', async () => {
    const result = await socialAI.generateCommentReply(TEST_RESTAURANT, {
      platform: 'google',
      text: 'Meilleur burger de Tunis ! Le double smash est incroyable, je reviendrai !',
      author: 'Karim B.',
      sentiment: 'positive',
    });
    if (result.requires_human_validation !== false) throw new Error('Ne devrait pas nécessiter validation pour commentaire positif');
    console.log(`\n     Validation requise: ${result.requires_human_validation}`);
    console.log(`     Réponse auto: "${result.auto_reply?.text?.substring(0, 60)}..."`);
    return result;
  });
  posReply ? passed++ : failed++;

  // ── TEST 8 : Réponse commentaire négatif ──────────────────────────────────
  const negReply = await runTest('Réponse commentaire négatif (validation humaine)', async () => {
    const result = await socialAI.generateCommentReply(TEST_RESTAURANT, {
      platform: 'google',
      text: 'Service scandaleux ! J\'ai attendu 45 minutes et la commande était froide. Je demande un remboursement.',
      author: 'Mohamed T.',
      sentiment: 'negative',
    });
    if (!result.requires_human_validation) throw new Error('Devrait nécessiter validation pour commentaire négatif/remboursement');
    console.log(`\n     ${WARN} Validation humaine requise: ${result.validation_reason}`);
    console.log(`     Urgence: ${result.urgency_level}`);
    return result;
  });
  negReply ? passed++ : failed++;

  // ── TEST 9 : Campagne publicitaire ────────────────────────────────────────
  const campaign = await runTest('Génération campagne publicitaire', async () => {
    const result = await socialAI.generateAdCampaign(TEST_RESTAURANT, {
      objective: 'commandes',
      budget_total: 500,
      budget_daily: 25,
      start_date: '2026-08-01',
      end_date: '2026-08-21',
      platform: 'facebook',
      offer: 'Menu Double Smash à 39 TND au lieu de 55 TND',
      target_radius_km: 5,
    });
    if (!result.validation_required) throw new Error('validation_required doit être true');
    if (!result.validation_statement) throw new Error('validation_statement manquant');
    console.log(`\n     Validation requise: ${result.validation_required}`);
    console.log(`     ${WARN} "${result.validation_statement}"`);
    return result;
  });
  campaign ? passed++ : failed++;

  // ── RÉSUMÉ ────────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log(`  Résultats : ${passed} réussis / ${passed + failed} tests`);
  if (failed === 0) {
    console.log(`  ${OK} Tous les tests passent !`);
  } else {
    console.log(`  ${ERR} ${failed} test(s) échoué(s)`);
  }
  console.log('════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
