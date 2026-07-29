'use client'
import { useEffect, useState } from 'react'
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const C = { navyD:'#081522', navyM:'#0F2D40', navyL:'#1A3A52', teal:'#00C48C', amber:'#F5A623', red:'#E84545', blue:'#3B82F6', green:'#27AE60', purple:'#8B5CF6', muted:'#6A8FAB', gray:'#8BAABF' }

function getToken() {
  return document.cookie.split(';').find(c => c.trim().startsWith('nr_token='))?.split('=')[1] || ''
}
function getUser() {
  try { const c = document.cookie.split(';').find(c => c.trim().startsWith('nr_user=')); return c ? JSON.parse(decodeURIComponent(c.split('=')[1])) : null } catch { return null }
}

const PLATFORMS: any = {
  google:    { icon:'🔍', color:'#4285F4', label:'Google Maps' },
  facebook:  { icon:'📘', color:'#1877F2', label:'Facebook'    },
  ubereats:  { icon:'🟢', color:'#06C167', label:'Uber Eats'   },
  deliveroo: { icon:'🦘', color:'#00CCBC', label:'Deliveroo'   },
  glovo:     { icon:'🟡', color:'#FFC244', label:'Glovo'       },
  jumia:     { icon:'🛒', color:'#F68B1E', label:'Jumia Food'  },
  tripadvisor:{ icon:'🦉', color:'#34E0A1', label:'TripAdvisor' },
}

function Stars({ rating, size=12 }: { rating:number, size?:number }) {
  return (
    <span style={{ fontSize:size }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ color: i <= Math.round(rating) ? C.amber : '#2A3F55' }}>★</span>
      ))}
    </span>
  )
}

function SentimentBadge({ sentiment }: { sentiment:string }) {
  const s: any = { positive:{c:C.green,l:'😊 Positif'}, negative:{c:C.red,l:'😞 Négatif'}, neutral:{c:C.muted,l:'😐 Neutre'} }
  const st = s[sentiment] || s.neutral
  return <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:`${st.c}20`, color:st.c, fontWeight:700 }}>{st.l}</span>
}

function UrgencyBadge({ urgency }: { urgency:string }) {
  const u: any = { critical:{c:C.red,l:'🚨 Urgent'}, medium:{c:C.amber,l:'⚠️ Moyen'}, low:{c:C.green,l:'✅ Normal'} }
  const st = u[urgency] || u.low
  return <span style={{ fontSize:10, padding:'2px 8px', borderRadius:10, background:`${st.c}20`, color:st.c, fontWeight:700 }}>{st.l}</span>
}

function RatingCircle({ rating, size=80 }: { rating:number, size?:number }) {
  const pct = (rating / 5) * 100
  const r = size/2 - 6
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  const color = rating >= 4 ? C.teal : rating >= 3 ? C.amber : C.red
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.navyL} strokeWidth={6} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
        <div style={{ fontSize:size/4, fontWeight:900, color }}>{rating}</div>
        <div style={{ fontSize:size/8, color:C.muted }}>/5</div>
      </div>
    </div>
  )
}

export default function ReputationPage() {
  const [data, setData]         = useState<any>(null)
  const [stats, setStats]       = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'all'|'positive'|'negative'|'pending'>('all')
  const [platform, setPlatform] = useState('all')
  const [selected, setSelected] = useState<any>(null)
  const [generating, setGen]    = useState(false)
  const [aiReply, setAiReply]   = useState('')
  const [syncing, setSyncing]   = useState(false)
  const user = typeof window !== 'undefined' ? getUser() : null

  const restaurant = { name: user?.restaurant || 'Mon Restaurant', cuisine_type: 'Restauration rapide halal' }

  useEffect(() => {
    loadData()
    loadStats()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const token = getToken()
      const r = await fetch('/api/v1/reputation', { headers:{ 'Authorization':`Bearer ${token}` } })
      const d = await r.json()
      setData(d)
    } catch(e) {}
    setLoading(false)
  }

  async function loadStats() {
    try {
      const token = getToken()
      const r = await fetch('/api/v1/reputation/stats', { headers:{ 'Authorization':`Bearer ${token}` } })
      const d = await r.json()
      setStats(d)
    } catch(e) {}
  }

  async function generateReply(review: any) {
    setGen(true); setAiReply('')
    try {
      const token = getToken()
      const r = await fetch('/api/v1/reputation/reply', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ review, restaurant })
      })
      const d = await r.json()
      setAiReply(d.suggested_reply || '')
      if (d.requires_validation) setAiReply(`⚠️ Validation requise : ${d.reason}\n\n${d.suggested_reply}`)
    } catch(e: any) { setAiReply(`Erreur : ${e.message}`) }
    setGen(false)
  }

  async function sync() {
    setSyncing(true)
    await loadData()
    setSyncing(false)
  }

  const reviews = data?.reviews || []
  const filtered = reviews.filter((r: any) => {
    const matchFilter = filter === 'all' ? true : filter === 'pending' ? !r.replied : r.sentiment === filter
    const matchPlatform = platform === 'all' || r.platform === platform
    return matchFilter && matchPlatform
  })

  const inp = { width:'100%', background:'#081522', border:'1px solid #1A3A52', borderRadius:8, padding:'10px 14px', fontSize:13, color:'#fff', outline:'none', fontFamily:'Inter,sans-serif', boxSizing:'border-box' as any }

  return (
    <div style={{ maxWidth:1100 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, fontFamily:'serif', marginBottom:4 }}>⭐ <span style={{ color:C.teal }}>Réputation</span> & Avis</h1>
          <div style={{ fontSize:13, color:C.muted }}>
            {data?.mode === 'demo' ? '🎭 Mode démo — Connectez Google Places + Facebook pour les vrais avis' : '🔴 Live — Données en temps réel'}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={sync} disabled={syncing} style={{ padding:'8px 16px', background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:8, color:C.gray, fontSize:13, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
            {syncing ? '⟳ Sync...' : '🔄 Synchroniser'}
          </button>
          <a href="/app/dashboard/admin" style={{ padding:'8px 16px', background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:8, color:C.gray, fontSize:13, textDecoration:'none', display:'flex', alignItems:'center' }}>
            ⚙️ Config API
          </a>
        </div>
      </div>

      {/* KPI Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Note globale',   value:data?.stats?.global_rating||'—', color:C.teal,    sub:'/ 5.0' },
          { label:'Total avis',     value:data?.stats?.total_reviews||0,   color:C.blue,    sub:'toutes plateformes' },
          { label:'Positifs',       value:data?.stats?.positive||0,        color:C.green,   sub:`${data?.stats?.total_reviews ? Math.round((data.stats.positive/data.stats.total_reviews)*100) : 0}%` },
          { label:'Négatifs',       value:data?.stats?.negative||0,        color:C.red,     sub:'à traiter' },
          { label:'Sans réponse',   value:data?.stats?.pending_reply||0,   color:C.amber,   sub:'en attente' },
          { label:'Urgents',        value:data?.stats?.critical||0,        color:C.red,     sub:'🚨 critiques' },
        ].map((s,i) => (
          <div key={i} style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:12, padding:'12px 14px', borderTop:`2px solid ${s.color}` }}>
            <div style={{ fontSize:9, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{value}</div>
            <div style={{ fontSize:10, color:C.muted, marginTop:2 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Sources + Graphe */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Sources plateformes */}
        <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:16 }}>📊 Par plateforme</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(data?.sources || []).map((s: any, i: number) => {
              const pl = PLATFORMS[s.platform] || { icon:'⭐', color:C.muted, label:s.platform }
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#081522', borderRadius:8, cursor:'pointer', border:`1px solid ${platform===s.platform?pl.color:C.navyL}` }}
                  onClick={() => setPlatform(platform===s.platform?'all':s.platform)}>
                  <div style={{ fontSize:20 }}>{pl.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{pl.label}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{s.total} avis · {s.status === 'live' ? '🔴 Live' : '🎭 Démo'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:16, fontWeight:900, color:s.rating>=4?C.teal:s.rating>=3?C.amber:C.red }}>{s.rating||'—'}</div>
                    <Stars rating={s.rating||0} size={11} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Graphe tendance */}
        <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:20 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>📈 Tendance note (5 semaines)</div>
          <div style={{ fontSize:11, color:C.muted, marginBottom:16 }}>Évolution de votre réputation</div>
          {stats?.weekly_trend ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={stats.weekly_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A3A52" vertical={false} />
                <XAxis dataKey="week" tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[3,5]} tick={{ fill:C.muted, fontSize:10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:'#0D2137', border:'1px solid #1A3A52', borderRadius:8, fontSize:12 }} />
                <Line type="monotone" dataKey="rating" name="Note" stroke={C.teal} strokeWidth={2} dot={{ fill:C.teal, r:4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:160, color:C.muted }}>Chargement...</div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:12 }}>
            {[
              { label:'Tps réponse', val:data?.stats?.avg_response_time||'—', c:C.teal },
              { label:'Cette semaine', val:`${stats?.weekly_trend?.[4]?.reviews||0} avis`, c:C.blue },
              { label:'Tendance', val:'+0.2 ⬆', c:C.green },
            ].map((s,i) => (
              <div key={i} style={{ background:'#081522', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                <div style={{ fontSize:9, color:C.muted, marginBottom:2 }}>{s.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:s.c }}>{s.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        {[
          { key:'all',      label:`Tous (${reviews.length})` },
          { key:'positive', label:`😊 Positifs (${data?.stats?.positive||0})` },
          { key:'negative', label:`😞 Négatifs (${data?.stats?.negative||0})` },
          { key:'pending',  label:`💬 Sans réponse (${data?.stats?.pending_reply||0})` },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key as any)} style={{
            padding:'7px 14px', borderRadius:8, border:`1px solid ${filter===f.key?C.teal:C.navyL}`,
            background:filter===f.key?'rgba(0,196,140,.12)':'transparent',
            color:filter===f.key?C.teal:C.muted, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif'
          }}>{f.label}</button>
        ))}
        <select style={{ ...inp, width:'auto', padding:'7px 14px' }} value={platform} onChange={e => setPlatform(e.target.value)}>
          <option value="all">Toutes plateformes</option>
          {Object.entries(PLATFORMS).map(([k,p]:any) => <option key={k} value={k}>{p.icon} {p.label}</option>)}
        </select>
      </div>

      {/* Liste avis */}
      {loading ? (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:200, color:C.muted, gap:12 }}>
          <div style={{ width:32, height:32, border:`3px solid ${C.navyL}`, borderTopColor:C.teal, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
          Chargement des avis...
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.length === 0 && <div style={{ textAlign:'center', padding:40, color:C.muted }}>Aucun avis dans cette catégorie</div>}
          {filtered.map((r: any) => {
            const pl = PLATFORMS[r.platform] || { icon:'⭐', color:C.muted }
            return (
              <div key={r.id} style={{ background:C.navyM, border:`1px solid ${r.urgency==='critical'?C.red:C.navyL}`, borderRadius:12, padding:18, cursor:'pointer', transition:'border-color .15s' }}
                onClick={() => { setSelected(r); setAiReply('') }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, flexWrap:'wrap', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:`${pl.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{pl.icon}</div>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{r.author}</div>
                      <div style={{ fontSize:11, color:C.muted }}>{r.relative || new Date(r.date).toLocaleDateString('fr-FR')} · {pl.label}</div>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
                    <Stars rating={r.rating} />
                    <SentimentBadge sentiment={r.sentiment} />
                    {r.urgency !== 'low' && <UrgencyBadge urgency={r.urgency} />}
                    {r.replied ? <span style={{ fontSize:10, color:C.green, fontWeight:700 }}>✅ Répondu</span> : <span style={{ fontSize:10, color:C.amber, fontWeight:700 }}>💬 En attente</span>}
                  </div>
                </div>
                <div style={{ fontSize:13, color:C.gray, lineHeight:1.7, marginBottom:r.reply_text?10:0 }}>{r.text}</div>
                {r.reply_text && (
                  <div style={{ background:'rgba(0,196,140,.06)', border:'1px solid rgba(0,196,140,.2)', borderRadius:8, padding:'10px 14px', marginTop:8 }}>
                    <div style={{ fontSize:10, color:C.teal, fontWeight:700, marginBottom:4 }}>✍️ Votre réponse</div>
                    <div style={{ fontSize:12, color:C.gray, lineHeight:1.6 }}>{r.reply_text}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal réponse IA */}
      {selected && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(4px)' }}
          onClick={() => { setSelected(null); setAiReply('') }}>
          <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:16, padding:28, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', position:'relative' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => { setSelected(null); setAiReply('') }} style={{ position:'absolute', top:12, right:14, background:'none', border:'none', color:C.muted, fontSize:20, cursor:'pointer' }}>✕</button>

            {/* Avis sélectionné */}
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
                <Stars rating={selected.rating} size={16} />
                <SentimentBadge sentiment={selected.sentiment} />
                {selected.urgency !== 'low' && <UrgencyBadge urgency={selected.urgency} />}
                <span style={{ fontSize:11, color:C.muted }}>{selected.author} · {PLATFORMS[selected.platform]?.label}</span>
              </div>
              <div style={{ fontSize:14, color:C.gray, lineHeight:1.7, background:'#081522', borderRadius:8, padding:'12px 16px', borderLeft:`3px solid ${PLATFORMS[selected.platform]?.color||C.teal}` }}>
                {selected.text}
              </div>
            </div>

            {/* Réponse existante */}
            {selected.reply_text && (
              <div style={{ background:'rgba(0,196,140,.06)', border:'1px solid rgba(0,196,140,.2)', borderRadius:8, padding:14, marginBottom:16 }}>
                <div style={{ fontSize:11, color:C.teal, fontWeight:700, marginBottom:6 }}>✅ Réponse publiée</div>
                <div style={{ fontSize:13, color:C.gray }}>{selected.reply_text}</div>
              </div>
            )}

            {/* Génération IA */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>🤖 Réponse Claude IA</div>
              {selected.urgency === 'critical' && (
                <div style={{ background:'rgba(232,69,69,.1)', border:'1px solid rgba(232,69,69,.3)', borderRadius:8, padding:'10px 14px', marginBottom:12, fontSize:12, color:C.red }}>
                  🚨 Avis urgent — Validation obligatoire avant publication
                </div>
              )}
              <button onClick={() => generateReply(selected)} disabled={generating} style={{ width:'100%', padding:'12px', borderRadius:8, border:'none', background:generating?C.navyL:C.purple, color:generating?C.muted:'#fff', fontSize:13, fontWeight:700, cursor:generating?'not-allowed':'pointer', fontFamily:'Inter,sans-serif', marginBottom:10 }}>
                {generating ? '⟳ Claude génère...' : '🤖 Générer une réponse avec Claude IA'}
              </button>
              {aiReply && (
                <div>
                  <textarea style={{ ...inp, minHeight:100, lineHeight:1.7, resize:'vertical' }} value={aiReply} onChange={e => setAiReply(e.target.value)} />
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <button onClick={() => generateReply(selected)} style={{ flex:1, padding:'9px', borderRadius:8, border:`1px solid ${C.navyL}`, background:'transparent', color:C.gray, fontSize:12, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>🔄 Régénérer</button>
                    <button style={{ flex:2, padding:'9px', borderRadius:8, border:'none', background:C.teal, color:C.navyD, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
                      {selected.urgency==='critical' ? '📤 Envoyer à la validation' : '✅ Publier la réponse'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
