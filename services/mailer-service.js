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
//
// Template : identite visuelle alignee sur le site (noveresto.app/index.html)
// et le dashboard (app/globals.css) — meme palette navy/teal, meme logo
// "Nover-Resto", meme structure de footer (tagline MENA, contact, copyright).
// Mise en page en tableaux HTML + styles inline (pas de <style> externe) :
// c'est la seule approche fiable a travers Gmail/Outlook/Apple Mail, qui
// suppriment ou ignorent CSS externe/variables CSS de facon inconsistante.

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'NoveResto <notifications@noveresto.app>';

const BRAND = {
  navyD:  '#081522',
  navy:   '#0D2137',
  navyM:  '#0F2D40',
  navyL:  '#1A3A52',
  teal:   '#00C48C',
  tealD:  '#009E71',
  amber:  '#F5A623',
  red:    '#E84545',
  muted:  '#8BAABF',
  mutedD: '#6A8FAB',
  white:  '#ffffff',
};

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

/**
 * Habillage commun : header (logo + bandeau couleur selon le type de
 * notification), corps du message, footer (tagline, contact, copyright).
 * accentColor distingue visuellement le type d'email au premier coup
 * d'oeil : teal = positif (reactivation, bienvenue), amber = securite
 * (mot de passe), red = alerte (desactivation).
 */
function renderEmailTemplate({ preheader, title, bodyHtml, accentColor, cta }) {
  const year = new Date().getFullYear();
  const ctaHtml = cta ? `
        <tr>
          <td style="padding:4px 32px 8px;">
            <a href="${cta.url}" style="display:inline-block;background:${BRAND.teal};color:${BRAND.navy};font-family:'Inter',Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:12px 28px;border-radius:8px;">${cta.label}</a>
          </td>
        </tr>` : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#F1F5F9;font-family:'Inter',Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader || ''}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F9;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${BRAND.white};border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(13,33,55,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND.navy};padding:28px 32px;text-align:center;">
              <span style="font-family:Georgia,'Playfair Display',serif;font-size:24px;font-weight:800;color:${BRAND.white};">Nover<span style="color:${BRAND.teal};">Resto</span></span>
            </td>
          </tr>

          <!-- Accent bar -->
          <tr><td style="height:4px;line-height:4px;font-size:0;background:${accentColor};">&nbsp;</td></tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 32px 8px;">
              <h1 style="margin:0 0 16px;font-family:'Inter',Arial,Helvetica,sans-serif;font-size:19px;font-weight:800;color:${BRAND.navy};">${title}</h1>
              <div style="font-family:'Inter',Arial,Helvetica,sans-serif;font-size:14px;line-height:1.7;color:${BRAND.navy};">
                ${bodyHtml}
              </div>
            </td>
          </tr>
          ${ctaHtml}
          <tr><td style="padding:16px 32px 32px;"></td></tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.navyD};padding:28px 32px;text-align:center;">
              <div style="font-family:'Inter',Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.7;margin-bottom:14px;">
                La plateforme SaaS IA conçue nativement pour la restauration MENA.<br>
                Tunisie · France · Maroc · Algérie · Sénégal · UAE
              </div>
              <div style="font-family:'Inter',Arial,Helvetica,sans-serif;font-size:12px;margin-bottom:14px;">
                <a href="https://noveresto.app" style="color:${BRAND.teal};text-decoration:none;margin:0 8px;">noveresto.app</a>
                <span style="color:${BRAND.navyL};">·</span>
                <a href="mailto:contact@noveresto.app" style="color:${BRAND.teal};text-decoration:none;margin:0 8px;">contact@noveresto.app</a>
              </div>
              <div style="font-family:'Inter',Arial,Helvetica,sans-serif;font-size:11px;color:${BRAND.mutedD};">
                © ${year} NoveResto · Tous droits réservés · 🔒 JWT Auth · RGPD
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function accountDeactivatedEmail(restaurantName) {
  return {
    subject: 'Votre compte NoveResto a été désactivé',
    html: renderEmailTemplate({
      preheader: `Le compte ${restaurantName} a ete desactive par un administrateur.`,
      title: '⛔ Compte désactivé',
      accentColor: BRAND.red,
      bodyHtml: `
        <p style="margin:0 0 14px;">Bonjour,</p>
        <p style="margin:0 0 14px;">Le compte NoveResto de <strong>${restaurantName}</strong> a été désactivé par un administrateur.</p>
        <p style="margin:0 0 14px;">Vous ne pouvez plus vous connecter tant que le compte n'est pas réactivé. Aucune donnée n'a été supprimée.</p>
        <p style="margin:0;">Si vous pensez qu'il s'agit d'une erreur, contactez le support NoveResto.</p>`,
      cta: { label: 'Contacter le support', url: 'mailto:contact@noveresto.app' }
    })
  };
}

function accountReactivatedEmail(restaurantName) {
  return {
    subject: 'Votre compte NoveResto a été réactivé',
    html: renderEmailTemplate({
      preheader: `Le compte ${restaurantName} est de nouveau actif.`,
      title: '✅ Compte réactivé',
      accentColor: BRAND.teal,
      bodyHtml: `
        <p style="margin:0 0 14px;">Bonjour,</p>
        <p style="margin:0 0 14px;">Bonne nouvelle : le compte NoveResto de <strong>${restaurantName}</strong> a été réactivé.</p>
        <p style="margin:0;">Vous pouvez de nouveau vous connecter normalement.</p>`,
      cta: { label: 'Se connecter', url: 'https://noveresto.app/app/login' }
    })
  };
}

function passwordChangedEmail() {
  return {
    subject: 'Votre mot de passe NoveResto a été modifié',
    html: renderEmailTemplate({
      preheader: 'Votre mot de passe vient d\'etre modifie.',
      title: '🔒 Mot de passe modifié',
      accentColor: BRAND.amber,
      bodyHtml: `
        <p style="margin:0 0 14px;">Bonjour,</p>
        <p style="margin:0 0 14px;">Le mot de passe de votre compte NoveResto vient d'être modifié. Par sécurité, votre session actuelle a été invalidée.</p>
        <p style="margin:0;">Si vous n'êtes pas à l'origine de ce changement, contactez immédiatement le support NoveResto.</p>`,
      cta: { label: 'Se reconnecter', url: 'https://noveresto.app/app/login' }
    })
  };
}

function newContactLeadEmail(contact) {
  const typeLabels = { demo: 'Demande de démo', pricing: 'Question tarifs', technical: 'Question technique', partnership: 'Partenariat', general: 'Général' };
  return {
    subject: `Nouveau lead NoveResto — ${contact.name}${contact.restaurant ? ' (' + contact.restaurant + ')' : ''}`,
    html: renderEmailTemplate({
      preheader: `${contact.name} vient de remplir le formulaire de contact.`,
      title: '📩 Nouveau lead',
      accentColor: BRAND.teal,
      bodyHtml: `
        <p style="margin:0 0 14px;"><strong>${contact.name}</strong> vient de remplir le formulaire de contact du site.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin-bottom:14px;">
          <tr><td style="padding:4px 0;color:${BRAND.mutedD};width:110px;">Email</td><td style="padding:4px 0;"><a href="mailto:${contact.email}" style="color:${BRAND.tealD};">${contact.email}</a></td></tr>
          ${contact.restaurant ? `<tr><td style="padding:4px 0;color:${BRAND.mutedD};">Restaurant</td><td style="padding:4px 0;">${contact.restaurant}</td></tr>` : ''}
          ${contact.country ? `<tr><td style="padding:4px 0;color:${BRAND.mutedD};">Pays</td><td style="padding:4px 0;">${contact.country}</td></tr>` : ''}
          ${contact.phone ? `<tr><td style="padding:4px 0;color:${BRAND.mutedD};">Téléphone</td><td style="padding:4px 0;">${contact.phone}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:${BRAND.mutedD};">Objet</td><td style="padding:4px 0;">${typeLabels[contact.type] || contact.type || 'Général'}</td></tr>
        </table>
        <div style="background:#F1F5F9;border-radius:8px;padding:14px 16px;font-size:14px;color:${BRAND.navy};white-space:pre-wrap;">${contact.message}</div>`,
      cta: { label: 'Répondre par email', url: `mailto:${contact.email}` }
    })
  };
}

function contactConfirmationEmail(name) {
  return {
    subject: 'Votre message a bien été reçu — NoveResto',
    html: renderEmailTemplate({
      preheader: 'Merci pour votre message, notre équipe vous répond sous 24h.',
      title: '✅ Message bien reçu',
      accentColor: BRAND.teal,
      bodyHtml: `
        <p style="margin:0 0 14px;">Bonjour ${name || ''},</p>
        <p style="margin:0 0 14px;">Merci pour votre message ! Notre équipe l'a bien reçu et vous répond sous 24h.</p>
        <p style="margin:0;">En attendant, n'hésitez pas à explorer <a href="https://noveresto.app" style="color:${BRAND.tealD};">noveresto.app</a>.</p>`
    })
  };
}

const PLATFORM_LABELS = { google: 'Google', facebook: 'Facebook', ubereats: 'Uber Eats', deliveroo: 'Deliveroo', glovo: 'Glovo', jumia: 'Jumia Food' };

function criticalReviewAlertEmail(restaurantName, reviews) {
  const count = reviews.length;
  const reviewsHtml = reviews.slice(0, 5).map(r => `
    <div style="border-left:3px solid ${BRAND.red};background:#F1F5F9;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:10px;">
      <div style="font-size:13px;font-weight:700;color:${BRAND.navy};margin-bottom:4px;">${'⭐'.repeat(Math.max(1, Math.round(r.rating || 1)))} · ${r.author || 'Anonyme'} · ${PLATFORM_LABELS[r.platform] || r.platform || ''}</div>
      <div style="font-size:13px;color:${BRAND.navy};font-style:italic;">"${(r.text || '').slice(0, 220)}${(r.text || '').length > 220 ? '…' : ''}"</div>
    </div>`).join('');

  return {
    subject: count === 1 ? `⚠️ Nouvel avis critique reçu — ${restaurantName}` : `⚠️ ${count} nouveaux avis critiques reçus — ${restaurantName}`,
    html: renderEmailTemplate({
      preheader: `${count > 1 ? count + ' nouveaux avis critiques' : 'Un nouvel avis critique'} sur ${restaurantName}.`,
      title: `⚠️ ${count > 1 ? count + ' avis critiques' : 'Avis critique'} à traiter`,
      accentColor: BRAND.red,
      bodyHtml: `
        <p style="margin:0 0 14px;">Bonjour,</p>
        <p style="margin:0 0 16px;">${count > 1 ? `${count} nouveaux avis critiques viennent d'être détectés` : `Un nouvel avis critique vient d'être détecté`} pour <strong>${restaurantName}</strong> — note très basse ou signalement d'un problème grave (remboursement, intoxication, plainte...).</p>
        ${reviewsHtml}
        <p style="margin:16px 0 0;">Une réponse rapide limite l'impact sur votre réputation en ligne.</p>`,
      cta: { label: 'Voir et répondre', url: 'https://noveresto.app/app/dashboard/reputation' }
    })
  };
}

module.exports = {
  sendEmail, renderEmailTemplate,
  accountDeactivatedEmail, accountReactivatedEmail, passwordChangedEmail,
  newContactLeadEmail, contactConfirmationEmail, criticalReviewAlertEmail
};
