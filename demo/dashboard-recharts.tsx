'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, Cell, Legend, ReferenceLine
} from 'recharts'

const C = { navyD:'#081522', navyM:'#0F2D40', navyL:'#1A3A52', teal:'#00C48C', amber:'#F5A623', red:'#E84545', blue:'#3B82F6', green:'#27AE60', purple:'#8B5CF6', muted:'#6A8FAB', gray:'#8BAABF' }

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('nr_token='))?.split('=')[1] || ''
}

// ── Tooltip custom ──
const CustomTooltip = ({ active, payload, label, prefix='', suffix='' }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#0D2137', border:'1px solid #1A3A52', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
      <div style={{ color:C.muted, marginBottom:6, fontWeight:600 }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ color:p.color, fontWeight:700 }}>
          {p.name} : {prefix}{typeof p.value === 'number' ? p.value.toLocaleString('fr-FR') : p.value}{suffix}
        </div>
      ))}
    </div>
  )
}

// ── KPI Card ──
function KPI({ label, value, delta, color, sub, trend }: any) {
  return (
    <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }} />
      <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800 }}>{value}</div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
        <div style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:`${color}20`, color }}>{delta}</div>
        {sub && <div style={{ fontSize:10, color:C.muted }}>{sub}</div>}
      </div>
      {trend && (
        <div style={{ marginTop:8, height:32 }}>
          <ResponsiveContainer width="100%" height={32}>
            <AreaChart data={trend} margin={{ top:0, right:0, bottom:0, left:0 }}>
              <Area type="monotone" dataKey="v" stroke={color} fill={`${color}20`} strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── Alert ──
function Alert({ severity, title, detail }: any) {
  const colors: any = { critical:C.red, warning:C.amber, info:C.blue }
  const c = colors[severity] || C.muted
  return (
    <div style={{ display:'flex', gap:10, padding:'10px 12px', borderRadius:8, background:`${c}10`, border:`1px solid ${c}30` }}>
      <div style={{ width:3, borderRadius:2, background:c, flexShrink:0 }} />
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:c }}>{title}</div>
        <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>{detail}</div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [data, setData]         = useState<any>(null)
  const [forecast, setForecast] = useState<any>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    const token = getToken()
    api.dashboard(token).then(d => { setData(d); setLoading(false) }).catch(() => setLoading(false))
    fetch('/api/v1/forecasts?horizon=7', { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json()).then(d => setForecast(d)).catch(() => {})
  }, [])

  // Données graphe CA semaine
  const caWeekData = data?.chart?.map((v: number, i: number) => ({
    day: data?.labels?.[i] || `J${i+1}`,
    ca: v,
    objectif: 12000,
  })) || []

  // Données Prophet J+7
  const prophetData = forecast?.forecasts?.slice(0,7).map((f: any) => {
    const dayFr: any = { Monday:'Lun', Tuesday:'Mar', Wednesday:'Mer', Thursday:'Jeu', Friday:'Ven', Saturday:'Sam', Sunday:'Dim' }
    return { day: dayFr[f.day] || f.day, ca: f.revenue_tnd, min: f.revenue_min, max: f.revenue_max, covers: f.covers }
  }) || []

  // Food cost gauge data
  const foodCostData = [{ name: 'Food Cost', value: data?.kpis?.food_cost_pct || 0, fill: data?.kpis?.food_cost_pct > 35 ? C.red : data?.kpis?.food_cost_pct > 30 ? C.amber : C.green }]

  // Trend sparkline (simulé)
  const trendRevenue = [9800,10200,10500,11200,12100,13800,14200,12480].map(v => ({ v }))
  const trendCovers  = [196,204,210,224,242,276,284,249].map(v => ({ v }))
  const trendFC      = [32.1,31.8,32.4,31.2,30.8,31.5,30.9,31.2].map(v => ({ v }))

  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, gap:12, color:C.muted }}>
      <div style={{ width:32, height:32, border:`3px solid ${C.navyL}`, borderTopColor:C.teal, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      Chargement...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth:1100 }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:24, fontWeight:800, fontFamily:'serif', marginBottom:4 }}>
          Bonjour, <span style={{ color:C.teal }}>{data?.user || 'Chef'}</span> 👋
        </h1>
        <div style={{ fontSize:13, color:C.muted }}>{today} · {data?.restaurant}</div>
      </div>

      {/* KPI Row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:20 }}>
        <KPI label="CA Aujourd'hui"  value={`${(data?.kpis?.revenue_today_tnd||0).toLocaleString('fr-FR')} TND`} delta="↑ +8.4%"   color={C.teal}   trend={trendRevenue} />
        <KPI label="Couverts"        value={data?.kpis?.covers || 0}                                              delta="↑ +12%"    color={C.blue}   trend={trendCovers}  />
        <KPI label="Food Cost"       value={`${data?.kpis?.food_cost_pct}%`}                                      delta="↓ -2.1pts" color={C.green}  trend={trendFC}      />
        <KPI label="Ticket Moyen"    value={`${data?.kpis?.avg_ticket_tnd} TND`}                                  delta="↑ +3.7%"   color={C.amber}                       />
        <KPI label="CA Demain · IA"  value={forecast?.forecasts?.[1] ? `${forecast.forecasts[1].revenue_tnd?.toLocaleString('fr-FR')} TND` : '—'}
          delta={forecast?.forecasts?.[1] ? `${forecast.forecasts[1].covers} couverts` : 'Chargement...'}
          color={C.purple} sub={`MAPE ${forecast?.mape||'—'}%`} />
      </div>

      {/* Graphes ligne 1 */}
      <div style={{ display:'grid', gridTemplateColumns:'3fr 2fr', gap:16, marginBottom:16 }}>
        {/* CA Semaine — Area Chart */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>📊 CA — 7 derniers jours</div>
              <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Réalisé vs Objectif 12 000 TND/jour</div>
            </div>
            <div style={{ fontSize:11, color:C.teal, fontWeight:700 }}>
              Total : {caWeekData.reduce((s:number,d:any)=>s+d.ca,0).toLocaleString('fr-FR')} TND
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={caWeekData} margin={{ top:5, right:10, bottom:0, left:0 }}>
              <defs>
                <linearGradient id="caGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.teal} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={C.teal} stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A3A52" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`} />
              <Tooltip content={<CustomTooltip suffix=" TND" />} />
              <ReferenceLine y={12000} stroke={C.amber} strokeDasharray="4 4" strokeWidth={1} />
              <Area type="monotone" dataKey="ca" name="CA" stroke={C.teal} fill="url(#caGrad)" strokeWidth={2} dot={{ fill:C.teal, r:3 }} activeDot={{ r:5 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Food Cost Gauge + Alertes */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {/* Food Cost radial */}
          <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:16, flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>🎯 Food Cost</div>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ position:'relative', width:100, height:100, flexShrink:0 }}>
                <ResponsiveContainer width={100} height={100}>
                  <RadialBarChart innerRadius={30} outerRadius={45} data={[{ value:100, fill:C.navyL },{ value:data?.kpis?.food_cost_pct||0, fill: (data?.kpis?.food_cost_pct||0)>35?C.red:(data?.kpis?.food_cost_pct||0)>30?C.amber:C.green }]} startAngle={90} endAngle={-270}>
                    <RadialBar dataKey="value" cornerRadius={4} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column' }}>
                  <div style={{ fontSize:16, fontWeight:900, color:data?.kpis?.food_cost_pct>35?C.red:data?.kpis?.food_cost_pct>30?C.amber:C.green }}>{data?.kpis?.food_cost_pct}%</div>
                </div>
              </div>
              <div>
                <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>Objectif : &lt; 30%</div>
                {[{ label:'Cette semaine', val:`${data?.kpis?.food_cost_pct}%`, c:C.amber },
                  { label:'Mois dernier', val:'33.2%', c:C.muted },
                  { label:'Objectif', val:'28%', c:C.green }
                ].map((r,i) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:24, fontSize:11, padding:'2px 0' }}>
                    <span style={{ color:C.muted }}>{r.label}</span>
                    <span style={{ color:r.c, fontWeight:700 }}>{r.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Graphes ligne 2 */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Prévisions Prophet — Bar Chart avec intervalles */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700 }}>🧠 Prévisions Prophet J+7</div>
              <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>MAPE {forecast?.mape||'—'}% · Prophet v1.3.0</div>
            </div>
            <a href="/app/dashboard/forecasts" style={{ fontSize:11, color:C.teal, textDecoration:'none', fontWeight:600 }}>Détail →</a>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={prophetData} margin={{ top:5, right:10, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A3A52" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${Math.round(v/1000)}k`} />
              <Tooltip content={<CustomTooltip suffix=" TND" />} />
              <Bar dataKey="ca" name="CA prévu" radius={[4,4,0,0]}>
                {prophetData.map((_:any, i:number) => {
                  const day = forecast?.forecasts?.[i]?.day
                  const isWeekend = ['Friday','Saturday','Sunday'].includes(day)
                  return <Cell key={i} fill={isWeekend ? C.teal : 'rgba(0,196,140,0.5)'} />
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Couverts semaine — Line Chart */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:20 }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>👥 Couverts — 7 derniers jours</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:2 }}>Tendance et objectif quotidien</div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={caWeekData.map((d:any, i:number) => ({ ...d, covers:[196,204,210,224,242,276,284,249][i] || 0, objectif_covers:220 }))} margin={{ top:5, right:10, bottom:0, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1A3A52" vertical={false} />
              <XAxis dataKey="day" tick={{ fill:C.muted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip suffix=" cvts" />} />
              <ReferenceLine y={220} stroke={C.amber} strokeDasharray="4 4" strokeWidth={1} />
              <Line type="monotone" dataKey="covers" name="Couverts" stroke={C.blue} strokeWidth={2} dot={{ fill:C.blue, r:3 }} activeDot={{ r:5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Alertes + Insights Prophet */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>⚠️ Alertes temps réel</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {data?.alerts?.map((a:any, i:number) => <Alert key={i} {...a} />)}
            {(!data?.alerts || data.alerts.length === 0) && <div style={{ color:C.muted, fontSize:13, textAlign:'center', padding:20 }}>✅ Aucune alerte</div>}
          </div>
        </div>

        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🧠 Insights Prophet IA</div>
          {forecast ? (() => {
            const week = forecast.forecasts?.slice(0,7) || []
            const best  = week.reduce((a:any,b:any) => a.revenue_tnd>b.revenue_tnd?a:b, {})
            const worst = week.reduce((a:any,b:any) => a.revenue_tnd<b.revenue_tnd?a:b, {})
            const total = week.reduce((s:number,f:any) => s+f.revenue_tnd, 0)
            const dayFr:any = { Monday:'Lundi', Tuesday:'Mardi', Wednesday:'Mercredi', Thursday:'Jeudi', Friday:'Vendredi', Saturday:'Samedi', Sunday:'Dimanche' }
            return (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(0,196,140,.08)', border:'1px solid rgba(0,196,140,.2)' }}>
                  <div style={{ fontSize:11, color:C.teal, fontWeight:700 }}>🏆 Meilleur jour</div>
                  <div style={{ fontSize:14, fontWeight:700, marginTop:3 }}>{dayFr[best.day]} — {best.revenue_tnd?.toLocaleString('fr-FR')} TND</div>
                  <div style={{ fontSize:11, color:C.muted }}>{best.covers} couverts estimés</div>
                </div>
                <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(245,166,35,.08)', border:'1px solid rgba(245,166,35,.2)' }}>
                  <div style={{ fontSize:11, color:C.amber, fontWeight:700 }}>📉 Jour creux</div>
                  <div style={{ fontSize:13, fontWeight:700, marginTop:3 }}>{dayFr[worst.day]} — {worst.revenue_tnd?.toLocaleString('fr-FR')} TND</div>
                  <div style={{ fontSize:11, color:C.muted }}>Idéal pour promotions</div>
                </div>
                <div style={{ padding:'10px 12px', borderRadius:8, background:C.navyD, border:`1px solid ${C.navyL}` }}>
                  <div style={{ fontSize:11, color:C.muted, fontWeight:700 }}>📊 CA semaine estimé</div>
                  <div style={{ fontSize:18, fontWeight:800, marginTop:3 }}>{total?.toLocaleString('fr-FR')} TND</div>
                  <div style={{ fontSize:11, color:C.muted }}>MAPE {forecast.mape}% · {forecast.stats?.training_days}j</div>
                </div>
              </div>
            )
          })() : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:120, color:C.muted, gap:8 }}>
              <div style={{ width:20, height:20, border:`2px solid ${C.navyL}`, borderTopColor:C.teal, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
              Chargement Prophet...
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
