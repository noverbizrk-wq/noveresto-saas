'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

const C = { teal:'#00C48C', amber:'#F5A623', red:'#E84545', blue:'#3B82F6', green:'#27AE60', muted:'#6A8FAB', navyM:'#0F2D40', navyL:'#1A3A52', navyD:'#081522' }

const KPI = ({ label, value, delta, color, sub }: any) => (
  <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
    <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:color }} />
    <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{label}</div>
    <div style={{ fontSize:22, fontWeight:800 }}>{value}</div>
    <div style={{ fontSize:11, marginTop:4, padding:'2px 8px', borderRadius:10, display:'inline-block', background:`${color}20`, color }}>{delta}</div>
    {sub && <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>{sub}</div>}
  </div>
)

const Alert = ({ severity, title, detail }: any) => {
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

function ProphetKPI({ forecast }: { forecast: any }) {
  if (!forecast) return (
    <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'#8B5CF6' }} />
      <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>CA Demain (IA)</div>
      <div style={{ fontSize:16, fontWeight:800, color:C.muted }}>Chargement...</div>
    </div>
  )
  const tomorrow = forecast.forecasts?.[1] || forecast.forecasts?.[0]
  if (!tomorrow) return null
  const dayFr: any = { Monday:'Lun', Tuesday:'Mar', Wednesday:'Mer', Thursday:'Jeu', Friday:'Ven', Saturday:'Sam', Sunday:'Dim' }
  const isWeekend = ['Friday','Saturday','Sunday'].includes(tomorrow.day)
  return (
    <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'#8B5CF6' }} />
      <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>CA Demain · Prophet IA</div>
      <div style={{ fontSize:22, fontWeight:800, color: isWeekend ? C.teal : '#fff' }}>
        {tomorrow.revenue_tnd?.toLocaleString('fr-FR')} TND
      </div>
      <div style={{ fontSize:11, marginTop:4, padding:'2px 8px', borderRadius:10, display:'inline-block', background:'rgba(139,92,246,.15)', color:'#8B5CF6' }}>
        {dayFr[tomorrow.day]} · {tomorrow.covers} couverts
      </div>
      <div style={{ fontSize:10, color:C.muted, marginTop:4 }}>
        Fourchette : {tomorrow.revenue_min?.toLocaleString('fr-FR')} — {tomorrow.revenue_max?.toLocaleString('fr-FR')} TND
      </div>
    </div>
  )
}

function ProphetWeekBar({ forecast }: { forecast: any }) {
  if (!forecast?.forecasts?.length) return null
  const week = forecast.forecasts.slice(0, 7)
  const max  = Math.max(...week.map((f: any) => f.revenue_max))
  const dayFr: any = { Monday:'Lun', Tuesday:'Mar', Wednesday:'Mer', Thursday:'Jeu', Friday:'Ven', Saturday:'Sam', Sunday:'Dim' }

  return (
    <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>🧠 Prévisions Prophet J+7</div>
        <a href="/app/dashboard/forecasts" style={{ fontSize:11, color:C.teal, textDecoration:'none' }}>Voir détail →</a>
      </div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80 }}>
        {week.map((f: any, i: number) => {
          const pct = (f.revenue_tnd / max) * 100
          const isWeekend = ['Friday','Saturday','Sunday'].includes(f.day)
          const isFirst = i === 0
          return (
            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end', gap:3 }}>
              <div style={{ fontSize:9, color: isWeekend ? C.teal : C.muted, fontWeight:700 }}>
                {Math.round(f.revenue_tnd/1000)}k
              </div>
              <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${pct}%`, minHeight:4,
                background: isFirst ? C.amber : isWeekend ? C.teal : 'rgba(0,196,140,0.5)',
                border: isFirst ? `1px solid ${C.amber}` : 'none'
              }} />
              <div style={{ fontSize:9, color: isWeekend ? C.teal : C.muted, fontWeight: isWeekend ? 700 : 400 }}>
                {dayFr[f.day]?.slice(0,3) || f.day?.slice(0,3)}
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop:8, fontSize:10, color:C.muted }}>
        <span>MAPE : <strong style={{ color:C.teal }}>{forecast.mape}%</strong></span>
        <span>Modèle : <strong style={{ color:'#fff' }}>Prophet v1.3.0</strong></span>
        <span>{forecast.stats?.training_days}j d'entraînement</span>
      </div>
    </div>
  )
}

function getToken() {
  if (typeof document === 'undefined') return ''
  return document.cookie.split(';').find(c => c.trim().startsWith('nr_token='))?.split('=')[1] || ''
}

export default function DashboardPage() {
  const [data, setData]         = useState<any>(null)
  const [forecast, setForecast] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [fcLoading, setFcLoad]  = useState(true)

  useEffect(() => {
    const token = getToken()
    // Charger dashboard
    api.dashboard(token)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))

    // Charger prévisions Prophet J+7
    fetch('/api/v1/forecasts?horizon=7', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => { setForecast(d); setFcLoad(false) })
      .catch(() => setFcLoad(false))
  }, [])

  const today = new Date().toLocaleDateString('fr-FR', { weekday:'long', year:'numeric', month:'long', day:'numeric' })

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300, gap:12, color:C.muted }}>
      <div style={{ width:32, height:32, border:`3px solid ${C.navyL}`, borderTopColor:C.teal, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
      Chargement du dashboard...
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  return (
    <div style={{ maxWidth:1100 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:800, fontFamily:'serif', marginBottom:4 }}>
          Bonjour, <span style={{ color:C.teal }}>{data?.user || 'Chef'}</span> 👋
        </h1>
        <div style={{ fontSize:13, color:C.muted }}>{today} · {data?.restaurant}</div>
      </div>

      {/* KPIs — ligne 1 : données réelles + Prophet */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, marginBottom:16 }}>
        <KPI label="CA Aujourd'hui"  value={`${data?.kpis?.revenue_today_tnd?.toLocaleString('fr-FR')} TND`} delta="↑ +8.4%"   color={C.teal}  />
        <KPI label="Couverts"        value={data?.kpis?.covers}                                               delta="↑ +12%"    color={C.blue}  />
        <KPI label="Food Cost"       value={`${data?.kpis?.food_cost_pct}%`}                                  delta="↓ -2.1pts" color={C.green} />
        <KPI label="Ticket Moyen"    value={`${data?.kpis?.avg_ticket_tnd} TND`}                              delta="↑ +3.7%"   color={C.amber} />
        <ProphetKPI forecast={forecast} />
      </div>

      {/* Graphe CA semaine + Prévisions Prophet */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        {/* Graphe CA semaine */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📊 CA — 7 derniers jours</div>
          <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:100 }}>
            {data?.chart?.map((v: number, i: number) => {
              const max = Math.max(...data.chart)
              const pct = (v / max) * 100
              const isToday = i === data.chart.length - 1
              return (
                <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end', gap:4 }}>
                  <div style={{ fontSize:9, color: isToday ? C.teal : C.muted }}>{Math.round(v/1000)}k</div>
                  <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${pct}%`, minHeight:4,
                    background: isToday ? C.teal : 'rgba(0,196,140,0.4)',
                    border: isToday ? `1px solid ${C.teal}` : 'none'
                  }} />
                  <div style={{ fontSize:9, color: isToday ? C.teal : C.muted, fontWeight: isToday ? 700 : 400 }}>
                    {data?.labels?.[i]}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Prévisions Prophet J+7 */}
        <ProphetWeekBar forecast={forecast} />
      </div>

      {/* Alertes + Stats Prophet */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Alertes */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>⚠️ Alertes temps réel</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {data?.alerts?.map((a: any, i: number) => <Alert key={i} {...a} />)}
            {(!data?.alerts || data.alerts.length === 0) && (
              <div style={{ color:C.muted, fontSize:13, textAlign:'center', padding:20 }}>✅ Aucune alerte active</div>
            )}
          </div>
        </div>

        {/* Prophet insights */}
        <div style={{ background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:12, padding:16 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🧠 Insights Prophet IA</div>
          {forecast ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {(() => {
                const week = forecast.forecasts?.slice(0,7) || []
                const best = week.reduce((a: any,b: any) => a.revenue_tnd > b.revenue_tnd ? a : b, {})
                const worst = week.reduce((a: any,b: any) => a.revenue_tnd < b.revenue_tnd ? a : b, {})
                const dayFr: any = { Monday:'Lundi', Tuesday:'Mardi', Wednesday:'Mercredi', Thursday:'Jeudi', Friday:'Vendredi', Saturday:'Samedi', Sunday:'Dimanche' }
                const total = week.reduce((s: number, f: any) => s + f.revenue_tnd, 0)
                return (
                  <>
                    <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(0,196,140,.08)', border:'1px solid rgba(0,196,140,.2)' }}>
                      <div style={{ fontSize:11, color:C.teal, fontWeight:700 }}>🏆 Meilleur jour prévu</div>
                      <div style={{ fontSize:13, fontWeight:700, marginTop:3 }}>{dayFr[best.day]} — {best.revenue_tnd?.toLocaleString('fr-FR')} TND</div>
                      <div style={{ fontSize:11, color:C.muted }}>{best.covers} couverts estimés</div>
                    </div>
                    <div style={{ padding:'10px 12px', borderRadius:8, background:'rgba(245,166,35,.08)', border:'1px solid rgba(245,166,35,.2)' }}>
                      <div style={{ fontSize:11, color:C.amber, fontWeight:700 }}>📉 Jour le plus creux</div>
                      <div style={{ fontSize:13, fontWeight:700, marginTop:3 }}>{dayFr[worst.day]} — {worst.revenue_tnd?.toLocaleString('fr-FR')} TND</div>
                      <div style={{ fontSize:11, color:C.muted }}>Idéal pour promotions ou formations</div>
                    </div>
                    <div style={{ padding:'10px 12px', borderRadius:8, background:`${C.navyD}`, border:`1px solid ${C.navyL}` }}>
                      <div style={{ fontSize:11, color:C.muted, fontWeight:700 }}>📊 CA semaine estimé</div>
                      <div style={{ fontSize:16, fontWeight:800, marginTop:3, color:'#fff' }}>{total?.toLocaleString('fr-FR')} TND</div>
                      <div style={{ fontSize:11, color:C.muted }}>MAPE {forecast.mape}% · {forecast.stats?.training_days}j entraînement</div>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : (
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
