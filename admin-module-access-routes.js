// admin-module-access-routes.js
// Monté sur /api/v1/admin/* dans server.js. Réservé aux comptes admin
// (adminOnly déjà appliqué au niveau du montage dans server.js, comme
// pour /api/v1/admin/users et /api/v1/admin/contacts existants).

const express = require('express');
const router = express.Router();
const moduleAccessService = require('./services/module-access-service');

module.exports = function (pool) {

  // GET /api/v1/admin/modules — liste de référence de tous les modules
  router.get('/modules', (req, res) => {
    res.json({ data: moduleAccessService.ALL_MODULES });
  });

  // GET /api/v1/admin/clients-access — tous les comptes clients + leurs modules activés
  router.get('/clients-access', async (req, res) => {
    try {
      const users = await pool.query(
        `SELECT id, email, name, restaurant FROM users WHERE role != 'admin' ORDER BY id`
      );
      const access = await pool.query(`SELECT user_id, module_key FROM module_access`);

      const byUser = {};
      for (const row of access.rows) {
        if (!byUser[row.user_id]) byUser[row.user_id] = [];
        byUser[row.user_id].push(row.module_key);
      }

      const data = users.rows.map(u => ({
        ...u,
        modules: byUser[u.id] || []
      }));

      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/v1/admin/clients/:userId/modules  { modules: ['orders','stocks',...] }
  router.put('/clients/:userId/modules', async (req, res) => {
    try {
      const { modules } = req.body;
      if (!Array.isArray(modules)) {
        return res.status(400).json({ error: 'modules doit être un tableau de clés' });
      }
      await moduleAccessService.setUserModules(pool, req.params.userId, modules, req.user?.id);
      const updated = await moduleAccessService.getUserModules(pool, req.params.userId);
      res.json({ user_id: Number(req.params.userId), modules: updated });
    } catch (err) {
      res.status(err.statusCode || 500).json({ error: err.message });
    }
  });

  return router;
};
