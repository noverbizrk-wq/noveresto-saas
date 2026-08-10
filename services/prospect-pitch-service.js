// prospect-pitch-service.js
//
// Génère un message WhatsApp personnalisé pour un prospect donné, en
// s'appuyant sur ses vraies données (nom, palier d'opportunité, site web,
// avis Google) plutôt que le template fixe par palier déjà en place côté
// frontend (Lot 9c). Réutilise le même client Claude que le Copilote IA
// (lib/claude-client.js), aucune nouvelle dépendance.

const { callClaude } = require('../lib/claude-client');

const SYSTEM_PROMPT = `Tu rédiges des messages WhatsApp de prospection commerciale pour NoveResto, un SaaS de gestion de restaurant en Tunisie qui aide aussi à améliorer la présence digitale des établissements.

RÈGLES STRICTES :
- Le message est destiné à être envoyé par WhatsApp à un restaurateur que l'expéditeur n'a jamais contacté.
- Utilise UNIQUEMENT les données fournies sur ce prospect précis — cite un détail concret (absence de site, peu d'avis, note Google...) plutôt qu'un argumentaire générique.
- Ton chaleureux et direct, jamais commercial-agressif ni familier à l'excès. Une seule relance polie à la fin (proposer 5 minutes d'échange), jamais de promesse chiffrée non vérifiable.
- 3 à 5 phrases maximum. Pas de markdown, pas d'emoji sauf éventuellement un seul en fin de message.
- Réponds uniquement avec le texte du message, rien d'autre (pas de préambule, pas de guillemets autour).`;

async function generatePitch(prospect) {
  const facts = [];
  facts.push(`Nom de l'établissement : ${prospect.name}`);
  facts.push(`Catégorie : ${prospect.category}`);
  facts.push(prospect.website ? `Site web : oui (${prospect.website})` : `Site web : aucun`);
  facts.push(prospect.rating ? `Note Google : ${prospect.rating}/5 (${prospect.review_count} avis)` : `Aucun avis Google`);
  facts.push(`Palier d'opportunité calculé : ${prospect.opportunity_tier}`);

  const userPrompt = `Données du prospect :\n${facts.join('\n')}\n\nRédige le message WhatsApp de premier contact.`;

  const message = await callClaude(SYSTEM_PROMPT, userPrompt, 400);
  return message.trim();
}

module.exports = { generatePitch };
