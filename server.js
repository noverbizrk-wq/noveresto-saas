const express = require('express')
const cors = require('cors')
const app = express()
app.use(cors(), express.json())

app.get('/api/v1/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', node: process.version })
})

app.get('/api/v1/dashboard', (req, res) => {
  res.json({
    restaurant: 'Burger House - Lac Tunis',
    kpis: { revenue_today_tnd: 12480, covers: 247, food_cost_pct: 31.2, avg_ticket_tnd: 50.5 },
    alerts: [
      { severity: 'critical', title: 'Rupture: Boeuf hache', detail: '1.2 kg restant' },
      { severity: 'warning',  title: 'DLC 24h: Poulet filet', detail: '4.5 kg' },
      { severity: 'info',     title: 'Food Cost +3.2pts', detail: '31.2% vs 28%' }
    ],
    chart: [9800, 11200, 10500, 12100, 13800, 14200, 12480],
    labels: ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
  })
})

app.get('/api/v1/stocks', (req, res) => {
  res.json({ valuation_tnd: 4280, critical_count: 3, items: [
    { name: 'Boeuf hache halal',  qty: 1.2, unit: 'kg',  status: 'RUPTURE'   },
    { name: 'Pain burger sesame', qty: 48,  unit: 'pcs', status: 'CRITIQUE'  },
    { name: 'Poulet filet',       qty: 4.5, unit: 'kg',  status: 'DLC_ALERT' },
    { name: 'Frites surgelees',   qty: 12,  unit: 'kg',  status: 'OK'        },
    { name: 'Ketchup Heinz',      qty: 3,   unit: 'pcs', status: 'OK'        },
    { name: 'Coca-Cola 33cl',     qty: 8,   unit: 'caisses', status: 'OK'    }
  ]})
})

app.get('/api/v1/forecasts', (req, res) => {
  res.json({ model: 'Prophet v1 MAPE 6.3%', forecasts: [
    { date: 'Mar 16', revenue_tnd: 13200, covers: 262 },
    { date: 'Mer 17', revenue_tnd: 11800, covers: 234 },
    { date: 'Jeu 18', revenue_tnd: 12400, covers: 246 },
    { date: 'Ven 19', revenue_tnd: 14800, covers: 295 },
    { date: 'Sam 20', revenue_tnd: 15400, covers: 308 }
  ]})
})

app.get('/api/v1/reputation', (req, res) => {
  res.json({ global: 4.6, total: 2396,
    platforms: { google: { rating: 4.7, count: 1248 }, facebook: { rating: 4.5, count: 836 }, tripadvisor: { rating: 4.6, count: 312 } }
  })
})

app.listen(3000, () => {
  console.log('')
  console.log('  NoveResto API OK - http://localhost:3000')
  console.log('  /api/v1/health     /api/v1/dashboard')
  console.log('  /api/v1/stocks     /api/v1/forecasts')
  console.log('  /api/v1/reputation')
  console.log('')
})
