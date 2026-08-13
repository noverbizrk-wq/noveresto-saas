// restaurant-scope-middleware.js
//
// Determine req.scopedRestaurantId : le tenant sur lequel la requete opere.
// Toutes les tables metier sont en restaurant_id -> users(id).
//
// Trois profils :
//   - 'admin'           : fournisseur du SaaS, acces a tous les restaurants.
//   - 'franchise_owner' : acces aux restaurants de SON organisation uniquement.
//                         Ne porte aucune donnee metier propre.
//   - 'client'          : 1 compte = 1 restaurant. scopedRestaurantId est
//                         TOUJOURS req.user.id ; tout restaurant_id fourni
//                         par le client est ignore (protection IDOR d'origine,
//                         conservee telle quelle).
//
// SECURITE — l'appartenance d'un restaurant a l'organisation d'un
// franchise_owner est verifiee EN BASE a chaque requete, jamais depuis le
// seul JWT : un JWT est fourni par le client et son organization_id peut
// etre perime (rattachement revoque entre deux connexions). La verification
// impose trois conditions cumulatives :
//   1. meme organization_id que le proprietaire connecte
//   2. organization_id NON NULL (sinon deux comptes sans organisation se
//      verraient mutuellement)
//   3. la cible est un 'client' (un franchise_owner ne peut se scoper ni sur
//      un autre franchise_owner, ni sur l'admin)
//
// Factory : a besoin de `pool` et devient asynchrone (contrairement a la
// version precedente, synchrone et sans dependance).
//   const restaurantScopeMiddleware = require('./middleware/restaurant-scope-middleware')(pool)

function createRestaurantScopeMiddleware (pool) {
  return async function restaurantScopeMiddleware (req, res, next) {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentification requise' });
    }

    const requestedRaw = req.query.restaurant_id || req.body?.restaurant_id || req.params.restaurant_id;

    // ---------- admin : acces total ----------
    if (req.user.role === 'admin') {
      req.scopedRestaurantId = requestedRaw ? Number(requestedRaw) : req.user.id;
      return next();
    }

    // ---------- franchise_owner : perimetre organisation ----------
    if (req.user.role === 'franchise_owner') {
      try {
        if (!requestedRaw) {
          // Aucun restaurant designe : retombe sur le premier de l'organisation.
          const first = await pool.query(
            `SELECT target.id
             FROM users target
             JOIN users owner ON owner.id = $1
             WHERE target.organization_id = owner.organization_id
               AND target.organization_id IS NOT NULL
               AND target.role = 'client'
             ORDER BY target.id
             LIMIT 1`,
            [req.user.id]
          );
          if (first.rows.length === 0) {
            return res.status(403).json({ error: 'Aucun restaurant rattache a ce compte' });
          }
          req.scopedRestaurantId = first.rows[0].id;
          return next();
        }

        const requested = Number(requestedRaw);
        if (!Number.isInteger(requested) || requested <= 0) {
          return res.status(400).json({ error: 'restaurant_id invalide' });
        }

        const allowed = await pool.query(
          `SELECT 1
           FROM users target
           JOIN users owner ON owner.id = $2
           WHERE target.id = $1
             AND target.organization_id = owner.organization_id
             AND target.organization_id IS NOT NULL
             AND target.role = 'client'`,
          [requested, req.user.id]
        );
        if (allowed.rows.length === 0) {
          return res.status(403).json({ error: 'Restaurant non autorise pour ce compte' });
        }

        req.scopedRestaurantId = requested;
        return next();
      } catch (err) {
        console.error('[restaurant-scope] erreur verification perimetre:', err.message);
        return res.status(500).json({ error: 'Erreur de verification des droits' });
      }
    }

    // ---------- client : 1 compte = 1 restaurant ----------
    req.scopedRestaurantId = req.user.id;
    next();
  };
}

module.exports = createRestaurantScopeMiddleware;
