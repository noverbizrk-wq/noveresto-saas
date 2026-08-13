require('dotenv').config();
const express = require('express')
const cors = require('cors')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { Pool } = require('pg')
const fetch = require('node-fetch')
const helmet = require('helmet')
const rateLimit = require('express-rate-limit')

const app = express()
app.use(helmet())
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'https://noveresto.app',
  credentials: true
}))
// Le webhook Deliveroo a besoin du corps BRUT (non parsé) pour vérifier
// la signature HMAC — parsing conditionnel pour ne jamais consommer le
// flux deux fois (express.json() puis express.raw() sur la même requête
// casserait silencieusement la vérification de signature).
app.use((req, res, next) => {
  if (req.originalUrl === '/api/v1/webhooks/deliveroo/orders') {
    express.raw({ type: 'application/json' })(req, res, next)
  } else {
    express.json()(req, res, next)
  }
})

// AUDIT SÉCURITÉ : plus de secret par défaut — le serveur refuse de démarrer
// si JWT_SECRET est absent ou trop court. Générer avec :
//   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('ERREUR FATALE : JWT_SECRET manquant ou trop faible (minimum 32 caractères) dans .env — arrêt du serveur.')
  process.exit(1)
}

const pool = new Pool({
  host: 'localhost', port: 5432,
  database: 'noveresto', user: 'noveresto', password: 'NoveResto2025!'
})
pool.connect().then(() => console.log('  PostgreSQL connecte')).catch(e => console.error('  PostgreSQL erreur:', e.message))

// AUDIT SÉCURITÉ : limite les tentatives de connexion (protection brute-force)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false
})

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return res.status(401).json({ error: 'Token manquant' })
  try { req.user = jwt.verify(token, JWT_SECRET); next() }
  catch(e) { res.status(401).json({ error: 'Token invalide' }) }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acces admin requis' })
  next()
}

app.post('/api/v1/auth/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' })
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    const user = rows[0]
    if (!user || !bcrypt.compareSync(password, user.password))
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' })
    const payload = { id: user.id, email: user.email, role: user.role, name: user.name, restaurant: user.restaurant, organization_id: user.organization_id }
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: payload })
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }) }
})

app.post('/api/v1/auth/register', async (req, res) => {
  const { email, password, name, restaurant, country } = req.body
  if (!email || !password || !name || !restaurant) return res.status(400).json({ error: 'Champs requis manquants' })
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court' })
  try {
    const exists = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (exists.rows.length) return res.status(409).json({ error: 'Email deja utilise' })
    const hash = bcrypt.hashSync(password, 10)
    const { rows } = await pool.query(
      'INSERT INTO users (email, password, name, restaurant, country, role) VALUES ($1,$2,$3,$4,$5,\'client\') RETURNING id, email, name, restaurant, role',
      [email.toLowerCase(), hash, name, restaurant, country || '']
    )
    const user = rows[0]
    const token = jwt.sign(user, JWT_SECRET, { expiresIn: '7d' })
    res.status(201).json({ token, user })
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }) }
})

app.get('/api/v1/auth/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT id, email, name, restaurant, country, role, created_at FROM users WHERE id = $1', [req.user.id])
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' })
    res.json({ user: rows[0] })
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }) }
})

app.post('/api/v1/contact', async (req, res) => {
  const { name, email, restaurant, country, phone, message, type } = req.body
  if (!name || !email || !message) return res.status(400).json({ error: 'Champs requis manquants' })
  try {
    const { rows } = await pool.query(
      'INSERT INTO contacts (name, email, restaurant, country, phone, message, type) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [name, email, restaurant||'', country||'', phone||'', message, type||'general']
    )
    res.status(201).json({ success: true, message: 'Message recu !', id: rows[0].id })
  } catch(e) { res.status(500).json({ error: 'Erreur serveur' }) }
})

app.get('/api/v1/admin/users', authMiddleware, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT id, email, name, restaurant, country, role, created_at FROM users ORDER BY created_at DESC')
  res.json({ users: rows, total: rows.length })
})

app.get('/api/v1/admin/contacts', authMiddleware, adminOnly, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC')
  res.json({ contacts: rows, total: rows.length })
})

const adminModuleAccessRoutes = require('./admin-module-access-routes')(pool)
app.use('/api/v1/admin', authMiddleware, adminOnly, adminModuleAccessRoutes)
const adminOrganizationsRoutes = require('./admin-organizations-routes')(pool)
app.use('/api/v1/admin', authMiddleware, adminOnly, adminOrganizationsRoutes)

app.get('/api/v1/health', async (req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ status: 'ok', version: '1.3.0', node: process.version, db: 'postgresql', auth: 'JWT', social_ai: 'enabled', reputation: 'enabled' })
  } catch(e) { res.status(500).json({ status: 'error', db: 'disconnected' }) }
})

app.get('/api/v1/dashboard', authMiddleware, (req, res) => {
  res.json({
    restaurant: req.user.restaurant, user: req.user.name, role: req.user.role,
    date: new Date().toLocaleDateString('fr-FR'),
    kpis: { revenue_today_tnd: 12480, covers: 247, food_cost_pct: 31.2, avg_ticket_tnd: 50.5 },
    alerts: [
      { severity: 'critical', title: 'Rupture: Boeuf hache',   detail: '1.2 kg restant' },
      { severity: 'warning',  title: 'DLC 36h: Poulet filet', detail: '4.5 kg' },
      { severity: 'info',     title: 'Commande auto prete',    detail: 'Metro TN - 1 840 TND' }
    ],
    chart: [9800, 11200, 10500, 12100, 13800, 14200, 12480],
    labels: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
  })
})

app.get('/api/v1/forecasts', authMiddleware, async (req, res) => {
  const horizon = parseInt(req.query.horizon || '14')
  const restaurant_id = req.user.id || 1
  try {
    const r = await fetch('http://localhost:5000/forecast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurant_id, horizon_days: horizon }),
    })
    const data = await r.json()
    if (!data.success) return res.status(500).json({ error: data.error })
    res.json({
      model: `Prophet v1.3.0 - MAPE ${data.mape || '-'}%`,
      mape: data.mape, stats: data.stats,
      forecasts: data.forecasts.map(f => ({
        date: f.date, day: f.day,
        revenue_tnd: f.revenue_tnd, revenue_min: f.revenue_min, revenue_max: f.revenue_max,
        covers: f.covers_est,
      })),
      generated_at: data.generated_at,
    })
  } catch(e) { res.status(500).json({ error: 'Erreur Prophet ML: ' + e.message }) }
})

app.post('/api/v1/import/csv', authMiddleware, async (req, res) => {
  const { rows, restaurant_id } = req.body
  if (!rows || !Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ success:false, error:'Donnees CSV manquantes' })
  let inserted = 0, skipped = 0
  const rid = restaurant_id || req.user.id || 1
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS sales_data (
      id SERIAL PRIMARY KEY, restaurant_id INTEGER NOT NULL,
      date DATE NOT NULL, revenue_tnd DECIMAL(10,2), covers INTEGER,
      food_cost_pct DECIMAL(5,2), avg_ticket DECIMAL(8,2),
      created_at TIMESTAMP DEFAULT NOW(), UNIQUE(restaurant_id, date)
    )`)
    for (const row of rows) {
      try {
        await pool.query(
          `INSERT INTO sales_data (restaurant_id, date, revenue_tnd, covers, food_cost_pct, avg_ticket)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (restaurant_id, date) DO UPDATE SET
           revenue_tnd=EXCLUDED.revenue_tnd, covers=EXCLUDED.covers`,
          [rid, row.date, row.revenue_tnd, row.covers||0, row.food_cost_pct||30, row.avg_ticket||50]
        )
        inserted++
      } catch(e) { skipped++ }
    }
    res.json({ success:true, inserted, skipped, total: rows.length })
  } catch(e) { res.status(500).json({ success:false, error: e.message }) }
})

const reputationRoutes = require('./reputation-routes')
app.use('/api/v1/reputation', authMiddleware, (req, res, next) => { req.pool = pool; next() }, reputationRoutes)

const socialRoutes = require('./social-routes')
app.use('/api/v1/social', authMiddleware, socialRoutes)

const restaurantScopeMiddleware = require('./middleware/restaurant-scope-middleware')(pool)
const restaurantOrdersRoutes = require('./restaurant-orders-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantMenuRoutes = require('./restaurant-menu-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantCostingRoutes = require('./restaurant-costing-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantForecastRoutes = require('./restaurant-forecast-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantPurchaseSuggestionsRoutes = require('./restaurant-purchase-suggestions-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantInventoryRoutes = require('./restaurant-inventory-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantStockRoutes = require('./restaurant-stock-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantStaffRoutes = require('./restaurant-staff-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantDisputesRoutes = require('./restaurant-disputes-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantFinanceRoutes = require('./restaurant-finance-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantCopilotRoutes = require('./restaurant-copilot-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const restaurantProspectionRoutes = require('./restaurant-prospection-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const publicDiagnosticRoutes = require('./public-diagnostic-routes')(pool)
const restaurantTeifRoutes = require('./restaurant-teif-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const { webhookRouter: deliverooWebhookRouter, manageRouter: deliverooManageRouter } = require('./deliveroo-routes')(pool, authMiddleware, restaurantScopeMiddleware)
const { webhookRouter: glovoWebhookRouter, manageRouter: glovoManageRouter } = require('./glovo-routes')(pool, authMiddleware, restaurantScopeMiddleware)
app.use('/api/v1/restaurant', restaurantOrdersRoutes)
app.use('/api/v1/restaurant', restaurantMenuRoutes)
app.use('/api/v1/restaurant', restaurantCostingRoutes)
app.use('/api/v1/restaurant', restaurantForecastRoutes)
app.use('/api/v1/restaurant', restaurantPurchaseSuggestionsRoutes)
app.use('/api/v1/restaurant', restaurantInventoryRoutes)
app.use('/api/v1/restaurant', restaurantStockRoutes)
app.use('/api/v1/restaurant', restaurantStaffRoutes)
app.use('/api/v1/restaurant', restaurantDisputesRoutes)
app.use('/api/v1/restaurant', restaurantFinanceRoutes)
app.use('/api/v1/restaurant', restaurantCopilotRoutes)
app.use('/api/v1/restaurant', restaurantProspectionRoutes)
app.use('/api/v1/public', publicDiagnosticRoutes)
app.use('/api/v1/restaurant', restaurantTeifRoutes)
app.use('/api/v1/webhooks', deliverooWebhookRouter)
app.use('/api/v1/restaurant', deliverooManageRouter)
app.use('/api/v1/webhooks', glovoWebhookRouter)
app.use('/api/v1/restaurant', glovoManageRouter)

const PORT = 3000
app.listen(PORT, () => {
  console.log('\n  NoveResto API v1.3.0')
  console.log('  POST /api/v1/auth/login')
  console.log('  GET  /api/v1/forecasts')
  console.log('  GET  /api/v1/reputation (demo + Google + Facebook)')
  console.log('  POST /api/v1/import/csv')
  console.log('  http://localhost:' + PORT + '\n')
})
