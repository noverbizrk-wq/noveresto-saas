// audit-log-service.js
//
// Généralise la table d'audit. L'audit a constaté que `social_audit_log`
// existe en base mais n'est jamais écrite par le code réellement chargé
// (seul un brouillon non require()é dans demo/ l'utilisait).
//
// Décision (à valider avec Ridha, cf. rapport §7 Phase 0 — "décider du sort
// de social_audit_log") : ce module crée une table `audit_log` générique
// et neutre par domaine (pas seulement "social"), utilisable par tous les
// sous-modules du module "Gestion du restaurant". Ne touche pas à
// `social_audit_log` existante — décision de fusion à prendre séparément.

async function logAction(pool, {
  restaurantId, userId, action, entityType, entityId,
  details = {}, ipAddress = null, result = 'success', errorMessage = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_log
        (restaurant_id, user_id, action, entity_type, entity_id, details,
         ip_address, result, error_message, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())`,
      [
        restaurantId, userId, action, entityType, entityId,
        JSON.stringify(details), ipAddress, result, errorMessage
      ]
    );
  } catch (err) {
    // L'audit ne doit jamais faire échouer l'action métier elle-même.
    console.error('[audit_log] échec d\'écriture (action métier non bloquée):', err.message);
  }
}

module.exports = { logAction };
