// restaurant-scope-middleware.js
//
// RÉÉCRIT après lecture du code réel du dépôt (server.js, reputation-routes.js:203).
// Découverte : la table `restaurants` (existante en base d'après l'audit,
// owner_id -> users) n'est JAMAIS interrogée par le code applicatif actuel.
// Le tenant réellement utilisé partout est simplement `req.user.id` :
//   - reputation-routes.js:203  → const restaurantId = req.user.id || 1
//   - server.js (forecasts)     → const restaurant_id = req.user.id || 1
//   - server.js (import/csv)    → const rid = restaurant_id || req.user.id || 1
//
// Confirmé par Ridha : 1 compte = 1 restaurant. Les comptes admin (role=
// 'admin') voient tous les restaurants via un sélecteur (cf. frontend).
//
// Conséquence : pas besoin d'interroger une table `restaurants` pour
// vérifier les droits. La règle est plus simple et plus sûre :
//   - Non-admin : req.scopedRestaurantId = req.user.id, TOUJOURS —
//     toute valeur restaurant_id fournie par le client (query/body) est
//     ignorée. C'est la correction de la faille IDOR : impossible pour
//     un utilisateur standard de désigner un autre restaurant_id.
//   - Admin : peut fournir restaurant_id explicitement (sélecteur), sinon
//     retombe sur son propre id.
//
// Pas de dépendance à `pool` — middleware synchrone, pas de factory.

function restaurantScopeMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentification requise' });
  }

  if (req.user.role === 'admin') {
    const requested = req.query.restaurant_id || req.body.restaurant_id || req.params.restaurant_id;
    req.scopedRestaurantId = requested ? Number(requested) : req.user.id;
  } else {
    req.scopedRestaurantId = req.user.id;
  }

  next();
}

module.exports = restaurantScopeMiddleware;
