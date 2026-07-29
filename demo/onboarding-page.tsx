'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const C = { navyD:'#081522', navyM:'#0F2D40', navyL:'#1A3A52', teal:'#00C48C', amber:'#F5A623', red:'#E84545', muted:'#6A8FAB', gray:'#8BAABF', white:'#FFFFFF' }

const STEPS = [
  { id:1, title:'Votre restaurant',   icon:'🏪', desc:'Informations générales'    },
  { id:2, title:'Votre cuisine',      icon:'🍽️', desc:'Type et spécialités'       },
  { id:3, title:'Vos objectifs',      icon:'🎯', desc:'Marketing et cibles'       },
  { id:4, title:'Votre compte',       icon:'🔐', desc:'Identifiants de connexion' },
  { id:5, title:'Confirmation',       icon:'✅', desc:'Récapitulatif et lancement'},
]

const CUISINES = ['Burgers','Pizza','Tacos','Kebab','Sushi','Gastronomique','Traditionnel','Healthy','Halal','Fast-food','Boulangerie','Pâtisserie','Fruits de mer','Grillade','Autre']
const COUNTRIES = ['Tunisie','France','Maroc','Algérie','Sénégal','Côte d\'Ivoire','UAE','Belgique','Autre']
const CURRENCIES = ['TND','EUR','MAD','DZD','XOF','AED','USD']
const OBJECTIVES = [
  { value:'orders',      label:'📦 Augmenter les commandes'      },
  { value:'traffic',     label:'🚶 Développer la fréquentation'  },
  { value:'notoriety',   label:'📣 Augmenter la notoriété'       },
  { value:'delivery',    label:'🛵 Développer la livraison'      },
  { value:'reservation', label:'📅 Générer des réservations'     },
  { value:'heures',      label:'⏰ Remplir les heures creuses'   },
]
const PLATFORMS_DELIVERY = ['Uber Eats','Deliveroo','Jumia Food','Glovo','Talabat','En interne','Aucune']
const SERVICES = ['Sur place','Livraison','Click & Collect','Réservation en ligne']

function ProgressBar({ step }: { step: number }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:0, marginBottom:40 }}>
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display:'flex', alignItems:'center', flex: i < STEPS.length-1 ? 1 : 'none' }}>
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
            <div style={{
              width:40, height:40, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize: step > s.id ? 16 : 14,
              background: step > s.id ? C.teal : step === s.id ? 'rgba(0,196,140,.15)' : C.navyL,
              border: `2px solid ${step >= s.id ? C.teal : C.navyL}`,
              color: step > s.id ? C.navyD : step === s.id ? C.teal : C.muted,
              fontWeight:700, transition:'all .3s',
            }}>
              {step > s.id ? '✓' : s.icon}
            </div>
            <div style={{ fontSize:10, color: step >= s.id ? C.teal : C.muted, fontWeight: step === s.id ? 700 : 400, textAlign:'center', whiteSpace:'nowrap' }}>
              {s.title}
            </div>
          </div>
          {i < STEPS.length-1 && (
            <div style={{ flex:1, height:2, background: step > s.id ? C.teal : C.navyL, margin:'0 8px', marginBottom:22, transition:'background .3s' }} />
          )}
        </div>
      ))}
    </div>
  )
}

function Field({ label, required, children, hint }: any) {
  return (
    <div style={{ marginBottom:16 }}>
      <label style={{ display:'block', fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:6 }}>
        {label} {required && <span style={{ color:C.red }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize:11, color:C.muted, marginTop:4 }}>{hint}</div>}
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep]     = useState(1)
  const [loading, setLoad]  = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState(false)

  const [form, setForm] = useState({
    // Étape 1
    restaurant_name: '', address: '', city: '', country: 'Tunisie', phone: '', website: '',
    services: [] as string[], delivery_platforms: [] as string[], avg_ticket: '', currency: 'TND', capacity: '',
    // Étape 2
    cuisine_type: '', specialties: '', top_dishes: '', is_halal: false, is_vegetarian: false, open_hours: '',
    // Étape 3
    target_audience: '', target_age: '18-35', positioning: '', objectives: [] as string[],
    slow_days: [] as string[], competitors: '',
    // Étape 4
    name: '', email: '', password: '', confirm_password: '',
  })

  const inp = {
    width:'100%', background:'#081522', border:'1px solid #1A3A52', borderRadius:8,
    padding:'10px 14px', fontSize:13, color:'#fff', outline:'none',
    fontFamily:'Inter,sans-serif', boxSizing:'border-box' as any,
  }

  const u = (field: string, value: any) => setForm(f => ({ ...f, [field]: value }))

  const toggleArr = (field: string, value: string) => {
    setForm(f => {
      const arr = (f as any)[field] as string[]
      return { ...f, [field]: arr.includes(value) ? arr.filter((v:string) => v !== value) : [...arr, value] }
    })
  }

  const ChipSelect = ({ field, options }: { field: string, options: string[] }) => (
    <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
      {options.map(o => {
        const selected = ((form as any)[field] as string[]).includes(o)
        return (
          <button key={o} onClick={() => toggleArr(field, o)} style={{
            padding:'6px 14px', borderRadius:20, border:`1px solid ${selected ? C.teal : C.navyL}`,
            background: selected ? 'rgba(0,196,140,.15)' : 'transparent',
            color: selected ? C.teal : C.muted, fontSize:12, fontWeight:600,
            cursor:'pointer', fontFamily:'Inter,sans-serif', transition:'all .15s',
          }}>{o}</button>
        )
      })}
    </div>
  )

  function validateStep() {
    if (step === 1) {
      if (!form.restaurant_name) return 'Nom du restaurant requis'
      if (!form.city) return 'Ville requise'
      if (!form.phone) return 'Téléphone requis'
    }
    if (step === 2) {
      if (!form.cuisine_type) return 'Type de cuisine requis'
    }
    if (step === 3) {
      if (form.objectives.length === 0) return 'Sélectionnez au moins un objectif'
    }
    if (step === 4) {
      if (!form.name) return 'Votre nom est requis'
      if (!form.email || !form.email.includes('@')) return 'Email valide requis'
      if (!form.password || form.password.length < 8) return 'Mot de passe minimum 8 caractères'
      if (form.password !== form.confirm_password) return 'Les mots de passe ne correspondent pas'
    }
    return ''
  }

  function next() {
    const err = validateStep()
    if (err) { setError(err); return }
    setError('')
    setStep(s => s + 1)
  }

  function prev() { setError(''); setStep(s => s - 1) }

  async function submit() {
    setLoad(true)
    setError('')
    try {
      // 1. Créer le compte utilisateur
      const regRes = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          name:       form.name,
          email:      form.email,
          password:   form.password,
          restaurant: form.restaurant_name,
          country:    form.country,
        }),
      })
      const regData = await regRes.json()
      if (!regRes.ok) throw new Error(regData.error || 'Erreur inscription')

      // 2. Stocker le token
      const token = regData.token
      const user  = regData.user
      document.cookie = `nr_token=${token}; path=/; max-age=604800`
      document.cookie = `nr_user=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=604800`

      setSuccess(true)
      setTimeout(() => router.push('/app/dashboard'), 2500)
    } catch(e: any) {
      setError(e.message)
    }
    setLoad(false)
  }

  const DAYS = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche']

  if (success) return (
    <div style={{ minHeight:'100vh', background:C.navyD, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center', padding:40 }}>
        <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
        <div style={{ fontSize:28, fontWeight:800, marginBottom:12 }}>
          Bienvenue sur <span style={{ color:C.teal }}>NoveResto</span> !
        </div>
        <div style={{ fontSize:16, color:C.muted, marginBottom:24 }}>
          Votre restaurant <strong style={{ color:'#fff' }}>{form.restaurant_name}</strong> est prêt.
        </div>
        <div style={{ fontSize:14, color:C.teal }}>Redirection vers votre dashboard...</div>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:C.navyD, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 20px', fontFamily:'Inter,sans-serif', color:'#fff' }}>

      {/* Logo */}
      <div style={{ marginBottom:32, textAlign:'center' }}>
        <div style={{ fontSize:28, fontWeight:900 }}>
          Nover<span style={{ color:C.teal }}>Resto</span>
        </div>
        <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>Créez votre compte restaurant</div>
      </div>

      {/* Card */}
      <div style={{ width:'100%', maxWidth:620, background:C.navyM, border:`1px solid ${C.navyL}`, borderRadius:20, padding:36 }}>
        <ProgressBar step={step} />

        {/* Titre étape */}
        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:20, fontWeight:800 }}>
            {STEPS[step-1].icon} {STEPS[step-1].title}
          </div>
          <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>{STEPS[step-1].desc}</div>
        </div>

        {/* ── ÉTAPE 1 : Restaurant ── */}
        {step === 1 && (
          <div>
            <Field label="Nom du restaurant" required>
              <input style={inp} placeholder="Ex: Burger House" value={form.restaurant_name} onChange={e => u('restaurant_name', e.target.value)} />
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Ville" required>
                <input style={inp} placeholder="Ex: Tunis" value={form.city} onChange={e => u('city', e.target.value)} />
              </Field>
              <Field label="Pays">
                <select style={{ ...inp, cursor:'pointer' }} value={form.country} onChange={e => u('country', e.target.value)}>
                  {COUNTRIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Adresse">
              <input style={inp} placeholder="Ex: 12 Avenue Habib Bourguiba" value={form.address} onChange={e => u('address', e.target.value)} />
            </Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <Field label="Téléphone" required>
                <input style={inp} placeholder="Ex: +216 71 234 567" value={form.phone} onChange={e => u('phone', e.target.value)} />
              </Field>
              <Field label="Site web">
                <input style={inp} placeholder="Ex: www.burgerhouse.tn" value={form.website} onChange={e => u('website', e.target.value)} />
              </Field>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <Field label="Ticket moyen">
                <input style={inp} placeholder="50" type="number" value={form.avg_ticket} onChange={e => u('avg_ticket', e.target.value)} />
              </Field>
              <Field label="Devise">
                <select style={{ ...inp, cursor:'pointer' }} value={form.currency} onChange={e => u('currency', e.target.value)}>
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Capacité (couverts)">
                <input style={inp} placeholder="50" type="number" value={form.capacity} onChange={e => u('capacity', e.target.value)} />
              </Field>
            </div>
            <Field label="Services proposés">
              <ChipSelect field="services" options={SERVICES} />
            </Field>
            <Field label="Plateformes de livraison">
              <ChipSelect field="delivery_platforms" options={PLATFORMS_DELIVERY} />
            </Field>
          </div>
        )}

        {/* ── ÉTAPE 2 : Cuisine ── */}
        {step === 2 && (
          <div>
            <Field label="Type de cuisine" required>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                {CUISINES.map(c => (
                  <button key={c} onClick={() => u('cuisine_type', c)} style={{
                    padding:'6px 14px', borderRadius:20, border:`1px solid ${form.cuisine_type===c ? C.teal : C.navyL}`,
                    background: form.cuisine_type===c ? 'rgba(0,196,140,.15)' : 'transparent',
                    color: form.cuisine_type===c ? C.teal : C.muted,
                    fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif',
                  }}>{c}</button>
                ))}
              </div>
            </Field>
            <Field label="Spécialités">
              <input style={inp} placeholder="Ex: Double Smash Burger, Crispy Chicken..." value={form.specialties} onChange={e => u('specialties', e.target.value)} />
            </Field>
            <Field label="Plats les plus populaires">
              <input style={inp} placeholder="Ex: Burger XXL, Menu Étudiant..." value={form.top_dishes} onChange={e => u('top_dishes', e.target.value)} />
            </Field>
            <Field label="Horaires d'ouverture">
              <input style={inp} placeholder="Ex: Lun-Ven 11h-23h, Sam-Dim 11h-00h" value={form.open_hours} onChange={e => u('open_hours', e.target.value)} />
            </Field>
            <div style={{ display:'flex', gap:16, marginTop:8 }}>
              {[
                { field:'is_halal', label:'🕌 Halal certifié' },
                { field:'is_vegetarian', label:'🥗 Options végétariennes' },
              ].map(opt => (
                <button key={opt.field} onClick={() => u(opt.field, !(form as any)[opt.field])} style={{
                  flex:1, padding:'12px', borderRadius:10, border:`1px solid ${(form as any)[opt.field] ? C.teal : C.navyL}`,
                  background: (form as any)[opt.field] ? 'rgba(0,196,140,.12)' : 'transparent',
                  color: (form as any)[opt.field] ? C.teal : C.muted,
                  fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif',
                }}>{opt.label}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── ÉTAPE 3 : Objectifs ── */}
        {step === 3 && (
          <div>
            <Field label="Objectifs prioritaires" required hint="Sélectionnez tous ceux qui s'appliquent">
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {OBJECTIVES.map(o => {
                  const sel = form.objectives.includes(o.value)
                  return (
                    <button key={o.value} onClick={() => toggleArr('objectives', o.value)} style={{
                      padding:'12px 16px', borderRadius:10, border:`1px solid ${sel ? C.teal : C.navyL}`,
                      background: sel ? 'rgba(0,196,140,.08)' : 'transparent',
                      color: sel ? C.teal : C.gray, fontSize:13, fontWeight:600,
                      cursor:'pointer', fontFamily:'Inter,sans-serif', textAlign:'left',
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                    }}>
                      {o.label}
                      {sel && <span style={{ fontSize:16 }}>✓</span>}
                    </button>
                  )
                })}
              </div>
            </Field>
            <Field label="Clientèle cible">
              <input style={inp} placeholder="Ex: Cadres et étudiants du quartier" value={form.target_audience} onChange={e => u('target_audience', e.target.value)} />
            </Field>
            <Field label="Tranche d'âge cible">
              <select style={{ ...inp, cursor:'pointer' }} value={form.target_age} onChange={e => u('target_age', e.target.value)}>
                {['16-25','18-35','25-45','35-60','Tous âges'].map(a => <option key={a}>{a}</option>)}
              </select>
            </Field>
            <Field label="Jours les plus creux">
              <ChipSelect field="slow_days" options={DAYS} />
            </Field>
            <Field label="Concurrents principaux">
              <input style={inp} placeholder="Ex: McDonald's, Burger King..." value={form.competitors} onChange={e => u('competitors', e.target.value)} />
            </Field>
          </div>
        )}

        {/* ── ÉTAPE 4 : Compte ── */}
        {step === 4 && (
          <div>
            <div style={{ background:'rgba(0,196,140,.06)', border:'1px solid rgba(0,196,140,.2)', borderRadius:10, padding:'12px 16px', marginBottom:20, fontSize:13, color:C.gray, lineHeight:1.6 }}>
              💡 Ces identifiants vous permettront de vous connecter à votre dashboard NoveResto.
            </div>
            <Field label="Votre nom complet" required>
              <input style={inp} placeholder="Ex: Karim Ben Ali" value={form.name} onChange={e => u('name', e.target.value)} />
            </Field>
            <Field label="Adresse email" required>
              <input style={inp} placeholder="Ex: karim@burgerhouse.tn" type="email" value={form.email} onChange={e => u('email', e.target.value)} />
            </Field>
            <Field label="Mot de passe" required hint="Minimum 8 caractères">
              <input style={inp} placeholder="••••••••" type="password" value={form.password} onChange={e => u('password', e.target.value)} />
            </Field>
            <Field label="Confirmer le mot de passe" required>
              <input style={inp} placeholder="••••••••" type="password" value={form.confirm_password} onChange={e => u('confirm_password', e.target.value)} />
            </Field>
            <div style={{ marginTop:12, fontSize:11, color:C.muted, lineHeight:1.7 }}>
              En créant votre compte, vous acceptez nos <span style={{ color:C.teal, cursor:'pointer' }}>Conditions d'utilisation</span> et notre <span style={{ color:C.teal, cursor:'pointer' }}>Politique de confidentialité</span>. Vos données sont hébergées en France (AWS Paris) et protégées conformément au RGPD.
            </div>
          </div>
        )}

        {/* ── ÉTAPE 5 : Confirmation ── */}
        {step === 5 && (
          <div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { label:'🏪 Restaurant',  value: form.restaurant_name },
                { label:'📍 Ville',       value: `${form.city}, ${form.country}` },
                { label:'🍽️ Cuisine',     value: form.cuisine_type },
                { label:'📱 Téléphone',   value: form.phone },
                { label:'💰 Ticket moyen',value: `${form.avg_ticket} ${form.currency}` },
                { label:'🎯 Objectifs',   value: form.objectives.length ? `${form.objectives.length} objectif(s) défini(s)` : '—' },
                { label:'👤 Compte',      value: form.email },
              ].map((item, i) => (
                <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'10px 14px', background:C.navyD, borderRadius:8, fontSize:13 }}>
                  <span style={{ color:C.muted }}>{item.label}</span>
                  <span style={{ fontWeight:700 }}>{item.value || '—'}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop:24, background:'rgba(0,196,140,.06)', border:'1px solid rgba(0,196,140,.2)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.teal, marginBottom:8 }}>🚀 Ce qui vous attend</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  '✅ Dashboard personnalisé pour votre restaurant',
                  '🧠 Prévisions IA Prophet J+14 dès le 1er jour',
                  '📦 Gestion des stocks avec alertes automatiques',
                  '📲 Social Media IA — calendrier éditorial',
                  '⭐ Suivi de réputation Google Maps',
                ].map((item, i) => (
                  <div key={i} style={{ fontSize:12, color:C.gray }}>{item}</div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Erreur */}
        {error && (
          <div style={{ margin:'16px 0', padding:'10px 14px', background:'rgba(232,69,69,.12)', border:'1px solid #E84545', borderRadius:8, fontSize:13, color:'#E84545' }}>
            ❌ {error}
          </div>
        )}

        {/* Navigation */}
        <div style={{ display:'flex', gap:12, marginTop:28 }}>
          {step > 1 && (
            <button onClick={prev} style={{ flex:1, padding:'13px', borderRadius:10, border:`1px solid ${C.navyL}`, background:'transparent', color:C.gray, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
              ← Retour
            </button>
          )}
          {step < 5 ? (
            <button onClick={next} style={{ flex:2, padding:'13px', borderRadius:10, border:'none', background:C.teal, color:C.navyD, fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
              Continuer →
            </button>
          ) : (
            <button onClick={submit} disabled={loading} style={{ flex:2, padding:'13px', borderRadius:10, border:'none', background: loading ? C.navyL : C.teal, color: loading ? C.muted : C.navyD, fontSize:14, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'Inter,sans-serif' }}>
              {loading ? '⟳ Création en cours...' : '🚀 Lancer mon NoveResto'}
            </button>
          )}
        </div>

        {/* Login link */}
        {step === 1 && (
          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:C.muted }}>
            Déjà un compte ? <a href="/app/login" style={{ color:C.teal, textDecoration:'none', fontWeight:600 }}>Se connecter</a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop:24, fontSize:11, color:'#3A5570', textAlign:'center' }}>
        🔒 RGPD · JWT Auth · AWS Paris eu-west-3 · noveresto.app
      </div>
    </div>
  )
}
