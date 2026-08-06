// restaurant-staff-routes.js
// Monté sur /api/v1/restaurant/* dans server.js, même pattern que les Lots 1-2.

const express = require('express');
const router = express.Router();

module.exports = function (pool, authMiddleware, restaurantScope) {

  router.use(authMiddleware);

  const staffAccess = require('./middleware/module-access-middleware')(pool, 'staff');

  // ---------- Employés ----------

  router.get('/employees', restaurantScope, staffAccess, async (req, res) => {
    const { active } = req.query;
    const conditions = ['restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    if (active !== undefined) { conditions.push('is_active = $2'); params.push(active === 'true'); }

    const result = await pool.query(
      `SELECT * FROM employees WHERE ${conditions.join(' AND ')} ORDER BY name`,
      params
    );
    res.json({ data: result.rows });
  });

  router.post('/employees', restaurantScope, staffAccess, async (req, res) => {
    try {
      const { name, role, phone, email, hourly_cost } = req.body;
      if (!name) return res.status(400).json({ error: 'name requis' });
      const result = await pool.query(
        `INSERT INTO employees (restaurant_id, name, role, phone, email, hourly_cost)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.scopedRestaurantId, name, role || 'equipier', phone || null, email || null, hourly_cost || 0]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/employees/:id', restaurantScope, staffAccess, async (req, res) => {
    try {
      const fields = ['name', 'role', 'phone', 'email', 'hourly_cost', 'is_active'];
      const updates = [];
      const params = [];
      let idx = 1;
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
      params.push(req.params.id, req.scopedRestaurantId);
      const result = await pool.query(
        `UPDATE employees SET ${updates.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Employé introuvable' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ---------- Planning (créneaux) ----------

  // GET /api/v1/restaurant/shifts?from=&to=&employee_id=
  router.get('/shifts', restaurantScope, staffAccess, async (req, res) => {
    const { from, to, employee_id } = req.query;
    const conditions = ['s.restaurant_id = $1'];
    const params = [req.scopedRestaurantId];
    let idx = 2;
    if (from) { conditions.push(`s.starts_at >= $${idx++}`); params.push(from); }
    if (to) { conditions.push(`s.ends_at <= $${idx++}`); params.push(to); }
    if (employee_id) { conditions.push(`s.employee_id = $${idx++}`); params.push(employee_id); }

    const result = await pool.query(
      `SELECT s.*, e.name AS employee_name, e.role AS employee_role
       FROM shifts s
       JOIN employees e ON e.id = s.employee_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY s.starts_at`,
      params
    );
    res.json({ data: result.rows });
  });

  router.post('/shifts', restaurantScope, staffAccess, async (req, res) => {
    try {
      const { employee_id, starts_at, ends_at, note } = req.body;
      if (!employee_id || !starts_at || !ends_at) {
        return res.status(400).json({ error: 'employee_id, starts_at, ends_at requis' });
      }
      const owns = await pool.query(
        'SELECT id FROM employees WHERE id = $1 AND restaurant_id = $2',
        [employee_id, req.scopedRestaurantId]
      );
      if (owns.rows.length === 0) return res.status(404).json({ error: 'Employé introuvable' });

      const result = await pool.query(
        `INSERT INTO shifts (restaurant_id, employee_id, starts_at, ends_at, note, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.scopedRestaurantId, employee_id, starts_at, ends_at, note || null, req.user?.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.patch('/shifts/:id', restaurantScope, staffAccess, async (req, res) => {
    try {
      const fields = ['starts_at', 'ends_at', 'status', 'note'];
      const updates = [];
      const params = [];
      let idx = 1;
      for (const f of fields) {
        if (req.body[f] !== undefined) {
          updates.push(`${f} = $${idx++}`);
          params.push(req.body[f]);
        }
      }
      if (updates.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });
      params.push(req.params.id, req.scopedRestaurantId);
      const result = await pool.query(
        `UPDATE shifts SET ${updates.join(', ')} WHERE id = $${idx++} AND restaurant_id = $${idx} RETURNING *`,
        params
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Créneau introuvable' });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.delete('/shifts/:id', restaurantScope, staffAccess, async (req, res) => {
    const result = await pool.query(
      'DELETE FROM shifts WHERE id = $1 AND restaurant_id = $2 RETURNING id',
      [req.params.id, req.scopedRestaurantId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Créneau introuvable' });
    res.status(204).send();
  });

  return router;
};
