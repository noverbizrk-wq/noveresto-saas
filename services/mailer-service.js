// mailer-service.js
//
// Envoi d'emails transactionnels via l'API HTTP de Resend — pas de SDK
// installe, meme approche que le reste du projet qui appelle des APIs
// externes via fetch() directement (cf. server.js, recherche Google Place).
//
// Necessite RESEND_API_KEY dans .env. Tant qu'elle est absente, les emails
// sont simplement journalises en console : aucune fonction appelante ne
// doit jamais planter faute de cle configuree — cf. sendEmail(), qui ne
// leve jamais d'exception (best-effort, comme awardPointsForOrder dans
// loyalty-service.js).

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'NoveResto <notifications@noveresto.app>';

async function sendEmail({ to, subject, html }) {
  if (!RESEND_API_KEY) {
    console.log(`[mailer] RESEND_API_KEY absente — email non envoye (to=${to}, subject="${subject}")`);
    return { sent: false, reason: 'no_api_key' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM_EMAIL, to, subject, html })
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[mailer] echec envoi Resend:', res.status, errText);
      return { sent: false, reason: 'api_error' };
    }
    return { sent: true };
  } catch (err) {
    console.error('[mailer] erreur reseau envoi email:', err.message);
    return { sent: false, reason: 'network_error' };
  }
}

function accountDeactivatedEmail(restaurantName) {
  return {
    subject: 'Votre compte NoveResto a ete desactive',
    html: `<p>Bonjour,</p>
      <p>Le compte NoveResto de <strong>${restaurantName}</strong> a ete desactive par un administrateur.</p>
      <p>Vous ne pouvez plus vous connecter tant que le compte n'est pas reactive. Si vous pensez qu'il s'agit d'une erreur, contactez le support NoveResto.</p>`
  };
}

function accountReactivatedEmail(restaurantName) {
  return {
    subject: 'Votre compte NoveResto a ete reactive',
    html: `<p>Bonjour,</p>
      <p>Le compte NoveResto de <strong>${restaurantName}</strong> a ete reactive. Vous pouvez de nouveau vous connecter normalement.</p>`
  };
}

function passwordChangedEmail() {
  return {
    subject: 'Votre mot de passe NoveResto a ete modifie',
    html: `<p>Bonjour,</p>
      <p>Le mot de passe de votre compte NoveResto vient d'etre modifie.</p>
      <p>Si vous n'etes pas a l'origine de ce changement, contactez immediatement le support NoveResto.</p>`
  };
}

module.exports = { sendEmail, accountDeactivatedEmail, accountReactivatedEmail, passwordChangedEmail };
