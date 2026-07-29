// Route à ajouter dans server.js avant app.listen
// POST /api/v1/import/csv

app.post('/api/v1/import/csv', authMiddleware, async (req, res) => {
  const { rows, restaurant_id } = req.body
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ success:false, error:'Données CSV manquantes' })
  }

  let inserted = 0
  let skipped  = 0
  const rid = restaurant_id || req.user.id || 1

  try {
    // Créer la table si elle n'existe pas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales_data (
        id            SERIAL PRIMARY KEY,
        restaurant_id INTEGER NOT NULL,
        date          DATE NOT NULL,
        revenue_tnd   DECIMAL(10,2),
        covers        INTEGER,
        food_cost_pct DECIMAL(5,2),
        avg_ticket    DECIMAL(8,2),
        created_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(restaurant_id, date)
      )
    `)

    for (const row of rows) {
      try {
        const result = await pool.query(
          `INSERT INTO sales_data (restaurant_id, date, revenue_tnd, covers, food_cost_pct, avg_ticket)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (restaurant_id, date) DO UPDATE SET
             revenue_tnd   = EXCLUDED.revenue_tnd,
             covers        = EXCLUDED.covers,
             food_cost_pct = EXCLUDED.food_cost_pct,
             avg_ticket    = EXCLUDED.avg_ticket
           RETURNING id`,
          [rid, row.date, row.revenue_tnd, row.covers || 0, row.food_cost_pct || 30, row.avg_ticket || 50]
        )
        if (result.rows.length > 0) inserted++
        else skipped++
      } catch(e) {
        skipped++
      }
    }

    // Audit log
    try {
      await pool.query(
        `INSERT INTO social_audit_log (restaurant_id, user_id, action, entity_type, details, result)
         VALUES ($1, $2, 'csv_import', 'sales_data', $3, 'success')`,
        [rid, req.user.id, JSON.stringify({ inserted, skipped, rows: rows.length })]
      )
    } catch(e) {}

    res.json({ success:true, inserted, skipped, total: rows.length, restaurant_id: rid })
  } catch(e: any) {
    res.status(500).json({ success:false, error:e.message })
  }
})
