// loyalty-campaign-service.js
//
// Phase B (partielle) : detection des candidats a une relance, sans aucun
// fournisseur SMS/WhatsApp Business API — genere des liens wa.me
// (WhatsApp click-to-chat), le staff clique et envoie lui-meme le message
// deja pre-rempli. Zero cout, zero contrat, fonctionne des maintenant.
//
// L'automatisation complete (envoi sans intervention humaine) restera
// bloquee tant qu'un vrai fournisseur (Twilio, WhatsApp Business API,
// operateur SMS tunisien) n'est pas choisi et contracte — decision produit,
// pas technique.

const WINBACK_THRESHOLD_DAYS = 21;

/**
 * Normalise un numero de telephone pour wa.me : chiffres uniquement,
 * pas de +, espaces, tirets. wa.me attend l'indicatif pays inclus.
 */
function normalizePhoneForWhatsApp(phone) {
  return String(phone).replace(/[^\d]/g, '');
}

function buildWhatsAppLink(phone, message) {
  const normalized = normalizePhoneForWhatsApp(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/**
 * Clients dont la derniere commande date de plus de WINBACK_THRESHOLD_DAYS,
 * mais qui ont deja commande au moins une fois (sinon ce n'est pas du
 * "win-back", juste un client jamais venu).
 */
async function getWinbackCandidates(pool, restaurantId, restaurantName) {
  const result = await pool.query(
    `SELECT c.id, c.name, c.phone, last.last_order_at
     FROM customers c
     JOIN (
       SELECT customer_id, MAX(received_at) AS last_order_at
       FROM orders
       WHERE status = 'completed'
       GROUP BY customer_id
     ) last ON last.customer_id = c.id
     WHERE c.restaurant_id = $1
       AND last.last_order_at < now() - INTERVAL '${WINBACK_THRESHOLD_DAYS} days'
     ORDER BY last.last_order_at ASC`,
    [restaurantId]
  );

  return result.rows.map((r) => {
    const daysSince = Math.floor((Date.now() - new Date(r.last_order_at).getTime()) / (1000 * 60 * 60 * 24));
    const message = `Bonjour ${r.name || ''}, ça fait ${daysSince} jours qu'on ne vous a pas vu chez ${restaurantName} ! Revenez vite, on vous attend 🙂`.replace(/\s+/g, ' ').trim();
    return {
      customer_id: r.id,
      name: r.name,
      phone: r.phone,
      last_order_at: r.last_order_at,
      days_since_last_order: daysSince,
      whatsapp_link: buildWhatsAppLink(r.phone, message),
      message_preview: message
    };
  });
}

/**
 * Clients dont l'anniversaire tombe aujourd'hui (jour/mois, annee ignoree).
 */
async function getBirthdayCandidates(pool, restaurantId, restaurantName) {
  const result = await pool.query(
    `SELECT id, name, phone, birthday
     FROM customers
     WHERE restaurant_id = $1 AND birthday IS NOT NULL
       AND to_char(birthday, 'MM-DD') = to_char(CURRENT_DATE, 'MM-DD')`,
    [restaurantId]
  );

  return result.rows.map((r) => {
    const message = `Joyeux anniversaire ${r.name || ''} ! 🎂 Toute l'équipe de ${restaurantName} vous offre un dessert pour l'occasion, à bientôt !`.replace(/\s+/g, ' ').trim();
    return {
      customer_id: r.id,
      name: r.name,
      phone: r.phone,
      birthday: r.birthday,
      whatsapp_link: buildWhatsAppLink(r.phone, message),
      message_preview: message
    };
  });
}

async function updateCustomerBirthday(pool, restaurantId, customerId, birthday) {
  const result = await pool.query(
    `UPDATE customers SET birthday = $1 WHERE id = $2 AND restaurant_id = $3 RETURNING *`,
    [birthday || null, customerId, restaurantId]
  );
  if (result.rows.length === 0) {
    const err = new Error('Client introuvable');
    err.statusCode = 404;
    throw err;
  }
  return result.rows[0];
}

module.exports = { getWinbackCandidates, getBirthdayCandidates, updateCustomerBirthday, buildWhatsAppLink, normalizePhoneForWhatsApp, WINBACK_THRESHOLD_DAYS };
