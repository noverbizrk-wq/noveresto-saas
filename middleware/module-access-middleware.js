// module-access-middleware.js
//
// Bloque l'accès à une route si le module correspondant n'est pas activé
// pour le compte connecté. Les comptes admin (role='admin') passent
// toujours (accès total, cohérent avec restaurant-scope-middleware.js).
//
// Usage : moduleAccessMiddleware(pool, 'recipes') — factory car ce
// middleware a besoin de connaître le pool ET la clé du module.
//
// À monter APRÈS authMiddleware et APRÈS restaurantScopeMiddleware
// (a besoin de req.user).

function moduleAccessMiddleware(pool, moduleKey) {
  return async function (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise' });
    }
    if (req.user.role === 'admin') {
      return next();
    }
    try {
      const result = await pool.query(
        'SELECT 1 FROM module_access WHERE user_id = $1 AND module_key = $2',
        [req.scopedRestaurantId ?? req.user.id, moduleKey]
      );
      if (result.rows.length === 0) {
        return res.status(403).json({ error: `Accès au module "${moduleKey}" non autorisé pour ce compte` });
      }
      next();
    } catch (err) {
      res.status(500).json({ error: 'Erreur de vérification des droits' });
    }
  };
}

module.exports = moduleAccessMiddleware;
