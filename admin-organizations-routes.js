// admin-organizations-routes.js
//
// Gestion des organisations (franchises) — réservé aux comptes 'admin'.
// authMiddleware + adminOnly sont déjà appliqués au montage dans server.js
// (même convention que admin-module-access-routes.js, /api/v1/admin/users,
// /api/v1/admin/contacts).
//
// Conformément au choix produit : seul l'admin crée une organisation,
// y rattache des restaurants, et crée les comptes franchise_owner.
// Un franchise_owner ne peut rien créer lui-même.

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

module.exports = function (pool) {

  // ---------- Organisations ----------

  // GET /api/v1/admin/organizations — liste avec le nombre de restaurants
  router.get('/organizations', async (req, res) => {
    try {
      const result = await pool.query(
        `SELECT o.id, o.name, o.created_at,
                COUNT(u.id) FILTER (WHERE u.role = 'client') AS restaurants_count,
                COUNT(u.id) FILTER (WHERE u.role = 'franchise_owner') AS owners_count
         FROM organizations o
         LEFT JOIN users u ON u.organization_id = o.id
         GROUP BY o.id, o.name, o.created_at
         ORDER BY o.name`
      );
      res.json({ data: result.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/v1/admin/organizations/:id — detail avec ses membres
  router.get('/organizations/:id', async (req, res) => {
    try {
      const org = await pool.query('SELECT * FROM organizations WHERE id = $1', [req.params.id]);
      if (org.rows.length === 0) return res.status(404).json({ error: 'Organisation introuvable' });

      const members = await pool.query(
        `SELECT id, email, name, restaurant, role, country
         FROM users WHERE organization_id = $1 ORDER BY role, id`,
        [req.params.id]
      );
      res.json({ ...org.rows[0], members: members.rows });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/v1/admin/organizations
  router.post('/organizations', async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name requis' });
    try {
      const result = await pool.query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING *',
        [name]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Rattachement de restaurants ----------

  // POST /api/v1/admin/organizations/:id/members — rattache un compte existant
  router.post('/organizations/:id/members', async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'user_id requis' });
    try {
      const org = await pool.query('SELECT id FROM organizations WHERE id = $1', [req.params.id]);
      if (org.rows.length === 0) return res.status(404).json({ error: 'Organisation introuvable' });

      const target = await pool.query('SELECT id, role FROM users WHERE id = $1', [user_id]);
      if (target.rows.length === 0) return res.status(404).json({ error: 'Compte introuvable' });
      if (target.rows[0].role === 'admin') {
        return res.status(400).json({ error: 'Un compte admin ne peut pas etre rattache a une organisation' });
      }

      const result = await pool.query(
        `UPDATE users SET organization_id = $1 WHERE id = $2
         RETURNING id, email, name, restaurant, role, organization_id`,
        [req.params.id, user_id]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/v1/admin/organizations/:id/members/:userId — detache
  router.delete('/organizations/:id/members/:userId', async (req, res) => {
    try {
      const result = await pool.query(
        `UPDATE users SET organization_id = NULL
         WHERE id = $1 AND organization_id = $2
         RETURNING id`,
        [req.params.userId, req.params.id]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Compte non rattache a cette organisation' });
      }
      res.status(204).send();
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Comptes franchise_owner ----------

  // POST /api/v1/admin/organizations/:id/owners — cree un compte franchise_owner
  router.post('/organizations/:id/owners', async (req, res) => {
    const { email, password, name } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'email, password et name requis' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caracteres' });
    }
    try {
      const org = await pool.query('SELECT id FROM organizations WHERE id = $1', [req.params.id]);
      if (org.rows.length === 0) return res.status(404).json({ error: 'Organisation introuvable' });

      const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) return res.status(409).json({ error: 'Cet email est deja utilise' });

      const hashed = bcrypt.hashSync(password, 10);
      const result = await pool.query(
        `INSERT INTO users (email, password, name, role, organization_id)
         VALUES ($1, $2, $3, 'franchise_owner', $4)
         RETURNING id, email, name, role, organization_id`,
        [email, hashed, name, req.params.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
