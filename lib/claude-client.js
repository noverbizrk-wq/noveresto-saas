// claude-client.js
// Client Claude API partagé, extrait du moteur social-ai.js (même modèle,
// même pattern de retry) pour éviter de dupliquer une 3e fois ce code —
// recommandation notée dans GIT_WORKFLOW.md du Lot 1 lors de l'intégration
// du module "Gestion du restaurant".
//
// social-ai.js garde sa propre copie locale inchangée (aucune modification
// d'un fichier hors périmètre du module courant, cf. règle §27.11 du
// cahier des charges) — ce fichier sert uniquement le Copilote IA.

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;

async function callClaude(systemPrompt, userPrompt, maxTokens = DEFAULT_MAX_TOKENS) {
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

function parseJSON(text) {
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(clean);
  } catch (e) {
    throw new Error(`Impossible de parser la réponse Claude: ${e.message}\nRéponse: ${text.substring(0, 200)}`);
  }
}

module.exports = { callClaude, parseJSON, MODEL };
