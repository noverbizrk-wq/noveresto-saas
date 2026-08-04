// copilot-service.js
//
// Le "Copilote Restaurant" (§15 du cahier des charges) répond à des
// questions en langage naturel en s'appuyant UNIQUEMENT sur les données
// réelles du restaurant (jamais de données inventées). Deux briques :
//
// 1. buildRestaurantContext() : agrège les données réelles (100% testable
//    sans clé API, ce sont de simples requêtes SQL).
// 2. askCopilot() : envoie ce contexte + la question à Claude (nécessite
//    ANTHROPIC_API_KEY — non testable en sandbox, cf. note de livraison).
//
// getRecommendations() ne fait PAS d'appel Claude : les recommandations
// (stock faible, marge dégradée, litiges en attente) sont calculées par
// des règles simples directement sur les données, pour rester fiables et
// gratuites à chaque affichage — l'IA sert la conversation libre, pas les
// alertes systématiques.

const costingService = require('./costing-service');
const { getDisputesSummary } = require('./disputes-service');
const { callClaude } = require('../lib/claude-client');

async function buildRestaurantContext(pool, restaurantId) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const yesterdayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1).toISOString();
  const now = today.toISOString();
  const in7Days = new Date(today.getTime() + 7 * 24 * 3600 * 1000).toISOString();

  const [todayRevenue, yesterdayRevenue, lowStock, costs, disputes, upcomingShifts] = await Promise.all([
    pool.query(
      `SELECT COALESCE(SUM(gross_amount),0)::numeric AS revenue, COUNT(*) AS order_count
       FROM orders WHERE restaurant_id = $1 AND received_at >= $2 AND status != 'cancelled'`,
      [restaurantId, todayStart]
    ),
    pool.query(
      `SELECT COALESCE(SUM(gross_amount),0)::numeric AS revenue
       FROM orders WHERE restaurant_id = $1 AND received_at >= $2 AND received_at < $3 AND status != 'cancelled'`,
      [restaurantId, yesterdayStart, todayStart]
    ),
    pool.query(
      `SELECT name, current_stock, min_stock, unit FROM ingredients
       WHERE restaurant_id = $1 AND current_stock <= min_stock AND min_stock > 0`,
      [restaurantId]
    ),
    costingService.getAllMenuItemCosts(pool, restaurantId),
    getDisputesSummary(pool, restaurantId),
    pool.query(
      `SELECT COUNT(*) AS count FROM shifts
       WHERE restaurant_id = $1 AND starts_at BETWEEN $2 AND $3`,
      [restaurantId, now, in7Days]
    )
  ]);

  const sortedByMargin = [...costs].sort((a, b) => a.margin_pct - b.margin_pct);

  return {
    ca_aujourdhui: Number(todayRevenue.rows[0].revenue),
    commandes_aujourdhui: Number(todayRevenue.rows[0].order_count),
    ca_hier: Number(yesterdayRevenue.rows[0].revenue),
    ingredients_stock_faible: lowStock.rows,
    articles_menu: costs.map(c => ({
      nom: c.menu_item_name, prix: c.price, cout_matiere: c.recipe_cost,
      food_cost_pct: c.food_cost_pct, marge_pct: c.margin_pct
    })),
    article_marge_la_plus_faible: sortedByMargin[0] || null,
    article_marge_la_plus_forte: sortedByMargin[sortedByMargin.length - 1] || null,
    litiges: disputes,
    creneaux_planifies_7_jours: Number(upcomingShifts.rows[0].count)
  };
}

const SYSTEM_PROMPT = `Tu es le Copilote Restaurant de NoveResto, assistant intégré au tableau de bord d'un restaurateur en Tunisie.

RÈGLES STRICTES :
- Réponds UNIQUEMENT à partir des données fournies dans le contexte JSON. N'invente jamais de chiffre.
- Si une information demandée n'est pas dans le contexte, dis clairement que tu ne l'as pas plutôt que de deviner.
- Réponds en français, de façon concise et actionnable (3-5 phrases maximum sauf si la question demande une liste).
- Ne propose et n'exécute jamais d'action sensible (remboursement, suppression, modification de prix) — tu informes et conseilles, tu n'agis pas.
- Cite les chiffres exacts du contexte à l'appui de ta réponse.
- FORMAT DE RÉPONSE : texte simple uniquement, sans aucun Markdown (pas de #, pas de **, pas de tableaux avec |, pas de listes à puces avec -). Écris comme dans une conversation normale, avec des phrases complètes. Pour énumérer plusieurs éléments, utilise des phrases ("D'abord... Ensuite...") plutôt qu'une liste formatée.`;





async function askCopilot(pool, restaurantId, question) {
  const context = await buildRestaurantContext(pool, restaurantId);
  const userPrompt = `Contexte du restaurant (données réelles) :\n${JSON.stringify(context, null, 2)}\n\nQuestion du restaurateur : ${question}`;

  const answer = await callClaude(SYSTEM_PROMPT, userPrompt, 1024);

  return { answer, context_used: context };
}

/**
 * Recommandations calculées par règles (pas d'appel Claude, cf. note en
 * tête de fichier) — chaque recommandation suit le format demandé au
 * cahier des charges §15.2 : constat, données, impact, action.
 */
async function getRecommendations(pool, restaurantId) {
  const context = await buildRestaurantContext(pool, restaurantId);
  const recommendations = [];

  for (const ing of context.ingredients_stock_faible) {
    recommendations.push({
      type: 'stock_faible',
      constat: `${ing.name} est sous le seuil d'alerte`,
      donnees: `Stock actuel : ${Number(ing.current_stock).toFixed(3)} ${ing.unit}, seuil : ${Number(ing.min_stock).toFixed(3)} ${ing.unit}`,
      impact: 'Risque de rupture pouvant bloquer la préparation de plats',
      action: `Passer une commande d'achat pour ${ing.name}`,
      confiance: 'haute'
    });
  }

  if (context.article_marge_la_plus_faible && context.article_marge_la_plus_faible.margin_pct < 40) {
    const a = context.article_marge_la_plus_faible;
    recommendations.push({
      type: 'marge_faible',
      constat: `"${a.menu_item_name}" a la marge la plus faible du menu`,
      donnees: `Marge actuelle : ${a.margin_pct.toFixed(1)}% (food cost ${a.food_cost_pct.toFixed(1)}%)`,
      impact: 'Chaque vente de cet article rapporte peu comparé aux autres',
      action: 'Envisager un ajustement de prix ou une renégociation fournisseur',
      confiance: 'moyenne'
    });
  }

  if (Number(context.litiges.open_disputes) > 0) {
    recommendations.push({
      type: 'litiges_ouverts',
      constat: `${context.litiges.open_disputes} litige(s) en cours de traitement`,
      donnees: `Montant total demandé : ${Number(context.litiges.total_requested).toFixed(3)} TND`,
      impact: 'Écart financier non résolu tant que les litiges restent ouverts',
      action: 'Consulter la page Litiges pour faire avancer les dossiers',
      confiance: 'haute'
    });
  }

  if (context.ca_hier > 0 && context.ca_aujourdhui < context.ca_hier * 0.5) {
    recommendations.push({
      type: 'baisse_ca',
      constat: 'Le chiffre d\'affaires du jour est en net retrait par rapport à hier',
      donnees: `Aujourd'hui : ${context.ca_aujourdhui.toFixed(3)} TND vs hier : ${context.ca_hier.toFixed(3)} TND`,
      impact: 'Peut indiquer un problème opérationnel (fermeture, panne, jour creux)',
      action: 'Vérifier si c\'est un phénomène normal (jour de la semaine) ou un signal à investiguer',
      confiance: 'moyenne'
    });
  }

  return recommendations;
}

module.exports = { buildRestaurantContext, askCopilot, getRecommendations, SYSTEM_PROMPT };
