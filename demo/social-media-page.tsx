'use client'
import { useEffect, useState } from 'react'

const C = { navyD:'#081522', navyM:'#0F2D40', navyL:'#1A3A52', teal:'#00C48C', amber:'#F5A623', red:'#E84545', muted:'#6A8FAB', gray:'#8BAABF' }

function getToken() {
  return document.cookie.split(';').find(c => c.trim().startsWith('nr_token='))?.split('=')[1] || ''
}
function getUser() {
  try {
    const c = document.cookie.split(';').find(c => c.trim().startsWith('nr_user='))
    return c ? JSON.parse(decodeURIComponent(c.split('=')[1])) : null
  } catch { return null }
}

const PLATFORMS: any = {
  facebook:  { icon:'📘', color:'#1877F2', label:'Facebook'  },
  instagram: { icon:'📸', color:'#E1306C', label:'Instagram' },
  tiktok:    { icon:'🎵', color:'#FF0050', label:'TikTok'    },
}

const THEMES = [
  { value:'plat_signature',    label:'🍔 Plat signature'    },
  { value:'menu_jour',         label:'📋 Menu du jour'      },
  { value:'coulisses',         label:'🎬 Coulisses'         },
  { value:'promotion',         label:'🏷️ Promotion'         },
  { value:'avis_client',       label:'⭐ Avis client'       },
  { value:'video_preparation', label:'🎥 Vidéo préparation' },
  { value:'sondage',           label:'📊 Sondage'           },
  { value:'evenement',         label:'🎉 Événement'         },
  { value:'saisonnier',        label:'🌙 Saisonnier/Ramadan'},
]

const OBJECTIVES = [
  { value:'notoriete',    label:'📣 Notoriété'   },
  { value:'engagement',   label:'💬 Engagement'  },
  { value:'commercial',   label:'💰 Commercial'  },
  { value:'fidelisation', label:'♥ Fidélisation' },
]

const DAYS_FR = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam']
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS[platform] || { icon:'📱', color:C.muted, label:platform }
  return (
    <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:`${p.color}20`, color:p.color, border:`1px solid ${p.color}40`, display:'inline-flex', alignItems:'center', gap:4 }}>
      {p.icon} {p.label}
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s: any = {
    draft:              { color:C.muted,   label:'Brouillon'   },
    pending_validation: { color:C.amber,   label:'À valider'   },
    validated:          { color:C.teal,    label:'Validé ✓'    },
    scheduled:          { color:'#3B82F6', label:'Programmé'   },
    published:          { color:'#27AE60', label:'Publié ✅'   },
    failed:             { color:C.red,     label:'Échoué ❌'   },
  }
  const st = s[status] || { color:C.muted, label:status }
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:`${st.color}20`, color:st.color }}>
      {st.label}
    </span>
  )
}

function CalendarView({ posts, currentMonth, onSelectPost }: any) {
  const year  = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number|null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const getPostsForDay = (day: number) => {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
    return posts.filter((p: any) => p.scheduled_at?.startsWith(dateStr))
  }
  const today = new Date()
  const isToday = (day: number) => day === today.getDate() && month === today.getMonth() && year === today.getFullYear()

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
        {DAYS_FR.map(d => <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:C.muted, padding:'6px 0' }}>{d}</div>)}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const dayPosts = getPostsForDay(day)
          return (
            <div key={i} style={{ minHeight:80, background:isToday(day)?'rgba(0,196,140,.08)':C.navyM, border:`1px solid ${isToday(day)?C.teal:C.navyL}`, borderRadius:8, padding:'6px 6px 4px' }}>
              <div style={{ fontSize:12, fontWeight:isToday(day)?800:500, color:isToday(day)?C.teal:C.gray, marginBottom:4 }}>{day}</div>
              {dayPosts.slice(0,3).map((p: any, pi: number) => {
                const pl = PLATFORMS[p.platform] || { color:C.muted }
                return (
                  <div key={pi} onClick={() => onSelectPost(p)} style={{ fontSize:9, padding:'2px 5px', borderRadius:4, marginBottom:2, background:`${pl.color}20`, color:pl.color, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', cursor:'pointer' }}>
                    {PLATFORMS[p.platform]?.icon} {p.theme?.replace(/_/g,' ')}
                  </div>
                )
              })}
              {dayPosts.length > 3 && <div style={{ fontSize:9, color:C.muted }}>+{dayPosts.length-3}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function SocialMediaPage() {
  const [tab, setTab]               = useState<'calendar'|'generate'|'posts'>('calendar')
  const [currentMonth, setMonth]    = useState(new Date())
  const [posts, setPosts]           = useState<any[]>([])
  const [selectedPost, setPost]     = useState<any>(null)
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult]   = useState<any>(null)
  const [genError, setGenError]     = useState('')
  const [platform, setPlatform]     = useState('instagram')
  const [theme, setTheme]           = useState('plat_signature')
  const [objective, setObjective]   = useState('commercial')
  const [dish, setDish]             = useState('')
  const [promotion, setPromo]       = useState('')

  const user = typeof window !== 'undefined' ? getUser() : null

  const restaurant = {
    id: user?.id || 1,
    name: user?.restaurant || 'Mon Restaurant',
    cuisine_type: 'Restauration rapide halal',
    specialties: 'Burgers halal premium, Crispy Chicken, Loaded Fries',
    avg_ticket: 50,
    currency: 'TND',
    is_halal: true,
    has_delivery: true,
    country: 'Tunisie',
    language: 'Français',
    objectives: ['Augmenter les commandes', 'Développer la notoriété locale'],
    top_dishes: ['Double Smash Burger', 'Crispy Chicken', 'Loaded Fries'],
    target_audience: 'Cadres et étudiants',
    target_age: '18-35 ans',
  }

  useEffect(() => { setPosts(generateDemoPosts()) }, [currentMonth])

  function generateDemoPosts() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const result: any[] = []
    const platforms = ['facebook','instagram','tiktok']
    const themes    = ['plat_signature','coulisses','promotion','avis_client','menu_jour','sondage']
    const statuses  = ['validated','scheduled','published','pending_validation']
    const days      = [2,4,6,9,11,13,16,18,20,23,25,27]
    days.forEach((day, i) => {
      if (day > new Date(year, month+1, 0).getDate()) return
      result.push({
        id: i+1,
        platform: platforms[i%3],
        theme: themes[i%themes.length],
        objective: ['notoriete','engagement','commercial','fidelisation'][i%4],
        scheduled_at: `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}T${['11:00','13:00','18:00','20:00'][i%4]}:00`,
        status: statuses[i%statuses.length],
        caption_hook: 'Le burger qui fait craquer tout Tunis 🔥',
        caption_full: 'Venez découvrir notre Double Smash Burger — le préféré de nos clients. Halal certifié, ingrédients frais, servi en moins de 5 minutes. 🍔',
        hashtags: ['#BurgerHouse','#Tunis','#HalalFood','#Burger'],
        visual_suggestion: 'Photo overhead du burger avec frites sur fond noir',
      })
    })
    return result
  }

  async function generatePost() {
    setGenerating(true); setGenError(''); setGenResult(null)
    try {
      const token = getToken()
      const r = await fetch('/api/v1/social/post/generate', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ restaurant, platform, theme, objective, dish:dish||undefined, promotion:promotion||undefined }),
      })
      const d = await r.json()
      if (!r.ok || !d.success) throw new Error(d.error || 'Erreur API')
      setGenResult(d.post)
      setPosts(prev => [...prev, { id:Date.now(), platform, theme, objective, scheduled_at:new Date().toISOString(), status:'pending_validation', caption_hook:d.post.caption_hook, caption_full:d.post.caption_full, hashtags:d.post.hashtags, visual_suggestion:d.post.visual_suggestion?.description }])
    } catch(e: any) { setGenError(e.message) }
    setGenerating(false)
  }

  const pendingCount   = posts.filter(p => p.status==='pending_validation').length
  const scheduledCount = posts.filter(p => p.status==='scheduled').length
  const publishedCount = posts.filter(p => p.status==='published').length

  const inp = { width:'100%', background:'#081522', border:'1px solid #1A3A52', borderRadius:8, padding:'9px 13px', fontSize:13, color:'#fff', outline:'none', fontFamily:'Inter,sans-serif', boxSizing:'border-box' as any }

  return (
    <div style={{ maxWidth:1100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:800, fontFamily:'serif', marginBottom:4 }}>📲 Social Media <span style={{ color:C.teal }}>IA</span></h1>
          <div style={{ fontSize:13, color:C.muted }}>Calendrier éditorial · Génération Claude AI · Validation</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {Object.entries(PLATFORMS).map(([k,p]:any) => (
            <div key={k} style={{ display:'flex', alignItems:'center', gap:6, background:C.navyM, border:'1px solid #1A3A52', borderRadius:8, padding:'6px 12px' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:p.color }} />
              <span style={{ fontSize:12, color:C.gray }}>{p.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {[
          { label:'Publications ce mois', value:posts.length,   color:C.teal,    sub:'Toutes plateformes' },
          { label:'À valider',            value:pendingCount,   color:C.amber,   sub:'En attente'         },
          { label:'Programmées',          value:scheduledCount, color:'#3B82F6', sub:'Prêtes à publier'   },
          { label:'Publiées',             value:publishedCount, color:'#27AE60', sub:'Ce mois'            },
        ].map((s,i) => (
          <div key={i} style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:12, padding:16, borderTop:`2px solid ${s.color}` }}>
            <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:4, background:'#081522', borderRadius:10, padding:4, marginBottom:20, width:'fit-content' }}>
        {[
          { key:'calendar', label:'📅 Calendrier'                     },
          { key:'generate', label:'🤖 Générer avec IA'               },
          { key:'posts',    label:`📋 Publications (${posts.length})` },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key as any)} style={{ padding:'8px 16px', borderRadius:7, border:'none', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif', background:tab===t.key?C.teal:'transparent', color:tab===t.key?C.navyD:C.muted }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'calendar' && (
        <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:24 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth()-1, 1))} style={{ background:C.navyD, border:'1px solid #1A3A52', borderRadius:8, padding:'6px 14px', color:'#fff', cursor:'pointer', fontSize:16 }}>‹</button>
            <div style={{ fontSize:16, fontWeight:800 }}>{MONTHS_FR[currentMonth.getMonth()]} {currentMonth.getFullYear()}</div>
            <button onClick={() => setMonth(d => new Date(d.getFullYear(), d.getMonth()+1, 1))} style={{ background:C.navyD, border:'1px solid #1A3A52', borderRadius:8, padding:'6px 14px', color:'#fff', cursor:'pointer', fontSize:16 }}>›</button>
          </div>
          <CalendarView posts={posts} currentMonth={currentMonth} onSelectPost={setPost} />
          <div style={{ display:'flex', gap:16, marginTop:16, flexWrap:'wrap' }}>
            {Object.entries(PLATFORMS).map(([k,p]:any) => (
              <div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:C.muted }}>
                <div style={{ width:10, height:10, borderRadius:2, background:p.color }} />{p.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'generate' && (
        <div style={{ display:'grid', gridTemplateColumns:'350px 1fr', gap:16 }}>
          <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:24 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:20 }}>🤖 Paramètres de génération</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>Plateforme</label>
              <div style={{ display:'flex', gap:6 }}>
                {Object.entries(PLATFORMS).map(([k,p]:any) => (
                  <button key={k} onClick={() => setPlatform(k)} style={{ flex:1, padding:'8px 4px', borderRadius:8, border:`1px solid ${platform===k?p.color:C.navyL}`, background:platform===k?`${p.color}20`:'transparent', color:platform===k?p.color:C.muted, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>Thème</label>
              <select style={{ ...inp, cursor:'pointer' }} value={theme} onChange={e => setTheme(e.target.value)}>
                {THEMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>Objectif</label>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {OBJECTIVES.map(o => (
                  <button key={o.value} onClick={() => setObjective(o.value)} style={{ padding:'7px 8px', borderRadius:7, border:`1px solid ${objective===o.value?C.teal:C.navyL}`, background:objective===o.value?'rgba(0,196,140,.12)':'transparent', color:objective===o.value?C.teal:C.muted, fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>Plat mis en avant (optionnel)</label>
              <input style={inp} placeholder="Ex: Double Smash Burger" value={dish} onChange={e => setDish(e.target.value)} />
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:600, color:C.muted, textTransform:'uppercase', letterSpacing:.4, marginBottom:6 }}>Promotion (optionnel)</label>
              <input style={inp} placeholder="Ex: -20% ce week-end" value={promotion} onChange={e => setPromo(e.target.value)} />
            </div>
            <button onClick={generatePost} disabled={generating} style={{ width:'100%', padding:'13px', borderRadius:8, border:'none', background:generating?C.navyL:C.teal, color:generating?C.muted:C.navyD, fontSize:14, fontWeight:700, cursor:generating?'not-allowed':'pointer', fontFamily:'Inter,sans-serif' }}>
              {generating ? '⟳ Génération en cours...' : '🤖 Générer avec Claude IA'}
            </button>
            {genError && (
              <div style={{ marginTop:12, padding:'10px 13px', background:'rgba(232,69,69,.12)', border:'1px solid #E84545', borderRadius:8, fontSize:12, color:'#E84545' }}>
                ❌ {genError.includes('credit') ? 'Crédit Claude API insuffisant — rechargez sur console.anthropic.com' : genError}
              </div>
            )}
            <div style={{ marginTop:16, padding:'10px 13px', background:'#081522', borderRadius:8, fontSize:11, color:C.muted, lineHeight:1.6 }}>
              💡 Génération via Claude API (claude-sonnet-4-6) avec le profil complet de votre restaurant.
            </div>
          </div>

          <div>
            {!genResult && !generating && (
              <div style={{ background:C.navyM, border:'1px dashed #1A3A52', borderRadius:14, padding:40, textAlign:'center', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:12 }}>
                <div style={{ fontSize:48 }}>🤖</div>
                <div style={{ fontSize:16, fontWeight:700, color:C.gray }}>Prêt à générer</div>
                <div style={{ fontSize:13, color:C.muted, maxWidth:280, lineHeight:1.6 }}>Remplissez le formulaire et cliquez sur Générer pour créer une publication optimisée avec Claude IA.</div>
              </div>
            )}
            {generating && (
              <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:40, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16, height:'100%' }}>
                <div style={{ width:48, height:48, border:`4px solid ${C.navyL}`, borderTopColor:C.teal, borderRadius:'50%', animation:'spin 1s linear infinite' }} />
                <div style={{ fontSize:14, fontWeight:700 }}>Claude IA génère votre publication...</div>
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            )}
            {genResult && !generating && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ background:C.navyM, border:`1px solid ${PLATFORMS[platform]?.color}40`, borderRadius:14, padding:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <PlatformBadge platform={platform} />
                      <span style={{ fontSize:12, color:C.muted }}>{theme.replace(/_/g,' ')} · {objective}</span>
                    </div>
                    <StatusBadge status="pending_validation" />
                  </div>
                  <div style={{ background:'#081522', borderRadius:8, padding:'10px 14px', marginBottom:10, borderLeft:`3px solid ${C.teal}` }}>
                    <div style={{ fontSize:10, color:C.teal, fontWeight:700, marginBottom:4 }}>ACCROCHE</div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{genResult.caption_hook}</div>
                  </div>
                  <div style={{ background:'#081522', borderRadius:8, padding:'10px 14px', marginBottom:10 }}>
                    <div style={{ fontSize:10, color:C.muted, fontWeight:700, marginBottom:6 }}>TEXTE COMPLET</div>
                    <div style={{ fontSize:13, color:C.gray, lineHeight:1.7, whiteSpace:'pre-wrap' }}>{genResult.caption_full}</div>
                  </div>
                  {genResult.hashtags?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                      {genResult.hashtags.map((h:string,i:number) => <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'rgba(0,196,140,.1)', color:C.teal }}>{h}</span>)}
                    </div>
                  )}
                  {genResult.cta && <div style={{ fontSize:12, color:C.amber, fontWeight:600 }}>📣 CTA : {genResult.cta}</div>}
                </div>
                {genResult.visual_suggestion && (
                  <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, padding:16 }}>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:8 }}>🎨 Suggestion visuelle</div>
                    <div style={{ fontSize:12, color:C.gray, lineHeight:1.6 }}>
                      <strong style={{ color:'#fff' }}>Type :</strong> {genResult.visual_suggestion?.type}<br/>
                      <strong style={{ color:'#fff' }}>Description :</strong> {genResult.visual_suggestion?.description}<br/>
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => { setGenResult(null); generatePost() }} style={{ flex:1, padding:'10px', borderRadius:8, border:`1px solid ${C.navyL}`, background:C.navyM, color:C.gray, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>🔄 Régénérer</button>
                  <button style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:C.teal, color:C.navyD, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>✅ Valider et programmer</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'posts' && (
        <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:14, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8, padding:'12px 16px', background:'#0D2137', fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5 }}>
            <span>Date / Heure</span><span>Plateforme</span><span>Thème</span><span>Objectif</span><span>Statut</span>
          </div>
          {posts.map((p,i) => (
            <div key={p.id} onClick={() => setPost(p)} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8, padding:'11px 16px', borderBottom:'1px solid #1A3A5230', background:i%2===0?'transparent':'#0A1A27', cursor:'pointer' }}>
              <div style={{ fontSize:12 }}>
                <div style={{ fontWeight:600 }}>{p.scheduled_at?new Date(p.scheduled_at).toLocaleDateString('fr-FR'):'—'}</div>
                <div style={{ color:C.muted, fontSize:11 }}>{p.scheduled_at?new Date(p.scheduled_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}):''}</div>
              </div>
              <div style={{ display:'flex', alignItems:'center' }}><PlatformBadge platform={p.platform} /></div>
              <div style={{ fontSize:12, color:C.gray, display:'flex', alignItems:'center' }}>{p.theme?.replace(/_/g,' ')}</div>
              <div style={{ fontSize:12, color:C.muted, display:'flex', alignItems:'center' }}>{p.objective}</div>
              <div style={{ display:'flex', alignItems:'center' }}><StatusBadge status={p.status} /></div>
            </div>
          ))}
          <div style={{ padding:'10px 16px', borderTop:'1px solid #1A3A52', fontSize:11, color:C.muted, background:'#0D2137' }}>{posts.length} publication(s) ce mois</div>
        </div>
      )}

      {selectedPost && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(4px)', padding:20 }} onClick={() => setPost(null)}>
          <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:16, padding:28, width:'100%', maxWidth:540, position:'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setPost(null)} style={{ position:'absolute', top:12, right:14, background:'none', border:'none', color:C.muted, fontSize:20, cursor:'pointer' }}>✕</button>
            <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:16 }}>
              <PlatformBadge platform={selectedPost.platform} />
              <StatusBadge status={selectedPost.status} />
              <span style={{ fontSize:12, color:C.muted }}>{selectedPost.scheduled_at?new Date(selectedPost.scheduled_at).toLocaleString('fr-FR'):'—'}</span>
            </div>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:6, color:C.teal }}>{selectedPost.theme?.replace(/_/g,' ')}</div>
            {selectedPost.caption_hook && <div style={{ background:'#081522', borderRadius:8, padding:'10px 14px', marginBottom:10, borderLeft:`3px solid ${C.teal}` }}><div style={{ fontSize:13, fontWeight:700 }}>{selectedPost.caption_hook}</div></div>}
            {selectedPost.caption_full && <div style={{ background:'#081522', borderRadius:8, padding:'10px 14px', marginBottom:10 }}><div style={{ fontSize:13, color:C.gray, lineHeight:1.7 }}>{selectedPost.caption_full}</div></div>}
            {selectedPost.hashtags?.length > 0 && <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:12 }}>{selectedPost.hashtags.map((h:string,i:number) => <span key={i} style={{ fontSize:11, padding:'2px 8px', borderRadius:10, background:'rgba(0,196,140,.1)', color:C.teal }}>{h}</span>)}</div>}
            {selectedPost.visual_suggestion && <div style={{ fontSize:12, color:C.muted, background:'#081522', borderRadius:8, padding:'8px 12px', marginBottom:14 }}>🎨 {selectedPost.visual_suggestion}</div>}
            {selectedPost.status === 'pending_validation' && (
              <div style={{ display:'flex', gap:10 }}>
                <button style={{ flex:1, padding:'10px', borderRadius:8, border:`1px solid ${C.red}`, background:'transparent', color:C.red, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>❌ Refuser</button>
                <button style={{ flex:2, padding:'10px', borderRadius:8, border:'none', background:C.teal, color:C.navyD, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>✅ Valider et programmer</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
