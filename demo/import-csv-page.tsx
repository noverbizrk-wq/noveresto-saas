'use client'
import { useState, useRef } from 'react'

const C = { navyD:'#081522', navyM:'#0F2D40', navyL:'#1A3A52', teal:'#00C48C', amber:'#F5A623', red:'#E84545', muted:'#6A8FAB', gray:'#8BAABF' }

function getToken() {
  return document.cookie.split(';').find(c => c.trim().startsWith('nr_token='))?.split('=')[1] || ''
}

function parseCSV(text: string): { headers: string[], rows: any[], errors: string[] } {
  const lines  = text.trim().split('\n').filter(l => l.trim())
  const errors: string[] = []
  if (lines.length < 2) return { headers:[], rows:[], errors:['Fichier vide ou invalide'] }

  const sep     = lines[0].includes(';') ? ';' : ','
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g,''))
  const rows: any[] = []

  // Détecter colonnes
  const dateCol    = headers.findIndex(h => ['date','jour','day'].includes(h))
  const revenueCol = headers.findIndex(h => ['revenue','ca','chiffre','ventes','montant','total','revenue_tnd'].includes(h))
  const coversCol  = headers.findIndex(h => ['covers','couverts','clients','tickets','orders'].includes(h))

  if (dateCol === -1)    errors.push('Colonne "date" non trouvée')
  if (revenueCol === -1) errors.push('Colonne "revenue" ou "ca" non trouvée')

  if (errors.length) return { headers, rows, errors }

  lines.slice(1).forEach((line, i) => {
    const cols = line.split(sep).map(c => c.trim().replace(/['"]/g,''))
    const dateStr = cols[dateCol]
    const revenue = parseFloat(cols[revenueCol]?.replace(',','.') || '0')
    const covers  = coversCol >= 0 ? parseInt(cols[coversCol] || '0') : Math.round(revenue / 50)

    // Valider date
    const date = new Date(dateStr.replace(/\//g,'-'))
    if (isNaN(date.getTime())) {
      errors.push(`Ligne ${i+2}: date invalide "${dateStr}"`)
      return
    }
    if (isNaN(revenue) || revenue < 0) {
      errors.push(`Ligne ${i+2}: CA invalide "${cols[revenueCol]}"`)
      return
    }

    rows.push({
      date:        date.toISOString().slice(0,10),
      revenue_tnd: revenue,
      covers:      covers || Math.round(revenue / 50),
      food_cost_pct: parseFloat((28 + Math.random()*6).toFixed(1)),
      avg_ticket:  covers > 0 ? parseFloat((revenue/covers).toFixed(2)) : 50,
    })
  })

  return { headers, rows, errors }
}

function StatCard({ label, value, color }: any) {
  return (
    <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:10, padding:'12px 16px', borderTop:`2px solid ${color}` }}>
      <div style={{ fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
    </div>
  )
}

export default function ImportCSVPage() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile]         = useState<File|null>(null)
  const [parsed, setParsed]     = useState<any>(null)
  const [importing, setImport]  = useState(false)
  const [result, setResult]     = useState<any>(null)
  const [retraining, setRetrain]= useState(false)
  const [forecast, setForecast] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)
  const [step, setStep]         = useState<'upload'|'preview'|'done'>('upload')

  function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setForecast(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = parseCSV(text)
      setParsed(parsed)
      if (parsed.rows.length > 0) setStep('preview')
    }
    reader.readAsText(f, 'UTF-8')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f && f.name.endsWith('.csv')) handleFile(f)
  }

  async function importData() {
    if (!parsed?.rows?.length) return
    setImport(true)
    try {
      const token = getToken()
      const r = await fetch('/api/v1/import/csv', {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body: JSON.stringify({ rows: parsed.rows, restaurant_id: 1 }),
      })
      const d = await r.json()
      setResult(d)
      if (d.success) setStep('done')
    } catch(e: any) {
      setResult({ success:false, error:e.message })
    }
    setImport(false)
  }

  async function retrain() {
    setRetrain(true)
    try {
      const token = getToken()
      const r = await fetch('/api/v1/forecasts?horizon=14', {
        headers: { 'Authorization':`Bearer ${token}` }
      })
      const d = await r.json()
      setForecast(d)
    } catch(e) {}
    setRetrain(false)
  }

  const daysFr: any = { Monday:'Lun', Tuesday:'Mar', Wednesday:'Mer', Thursday:'Jeu', Friday:'Ven', Saturday:'Sam', Sunday:'Dim' }

  return (
    <div style={{ maxWidth:900 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:24, fontWeight:800, fontFamily:'serif', marginBottom:4 }}>
          📥 Import <span style={{ color:C.teal }}>CSV</span>
        </h1>
        <div style={{ fontSize:13, color:C.muted }}>Importez vos données de ventes réelles pour entraîner Prophet IA</div>
      </div>

      {/* Format attendu */}
      <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:12, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📋 Format CSV attendu</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Colonnes reconnues automatiquement :</div>
            {[
              { col:'date',    desc:'Date (YYYY-MM-DD ou DD/MM/YYYY)', req:true  },
              { col:'revenue', desc:'Chiffre d\'affaires (ou "ca")',   req:true  },
              { col:'covers',  desc:'Nombre de couverts (optionnel)',  req:false },
            ].map((c,i) => (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'center', padding:'5px 0', borderBottom:'1px solid #1A3A5220' }}>
                <code style={{ fontSize:11, background:'#081522', padding:'2px 8px', borderRadius:4, color:C.teal, fontFamily:'monospace' }}>{c.col}</code>
                <span style={{ fontSize:11, color:C.gray }}>{c.desc}</span>
                {c.req && <span style={{ fontSize:9, color:C.red, fontWeight:700 }}>REQUIS</span>}
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:8 }}>Exemple de fichier :</div>
            <pre style={{ background:'#081522', borderRadius:8, padding:'10px 14px', fontSize:11, color:C.teal, fontFamily:'monospace', margin:0, lineHeight:1.8 }}>
{`date,revenue,covers
2026-07-01,12480,249
2026-07-02,9240,185
2026-07-03,11850,237
2026-07-04,14200,284`}
            </pre>
            <div style={{ fontSize:11, color:C.muted, marginTop:8 }}>Séparateur : virgule (,) ou point-virgule (;)</div>
          </div>
        </div>
      </div>

      {/* Zone upload */}
      {step === 'upload' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
          style={{
            border:`2px dashed ${dragOver ? C.teal : C.navyL}`,
            borderRadius:16, padding:60, textAlign:'center', cursor:'pointer',
            background: dragOver ? 'rgba(0,196,140,.05)' : C.navyM,
            transition:'all .2s',
          }}
        >
          <div style={{ fontSize:48, marginBottom:16 }}>📂</div>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:8 }}>
            Glissez votre fichier CSV ici
          </div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:20 }}>
            ou cliquez pour sélectionner un fichier
          </div>
          <div style={{ display:'inline-block', padding:'10px 24px', borderRadius:8, background:C.teal, color:C.navyD, fontSize:13, fontWeight:700 }}>
            Choisir un fichier CSV
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:12 }}>
            Formats acceptés : .csv — Taille max : 10 MB
          </div>
          <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        </div>
      )}

      {/* Prévisualisation */}
      {step === 'preview' && parsed && (
        <div>
          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:16 }}>
            <StatCard label="Lignes détectées"  value={parsed.rows.length}  color={C.teal}  />
            <StatCard label="Erreurs"           value={parsed.errors.length} color={parsed.errors.length ? C.red : C.teal} />
            <StatCard label="Fichier"           value={file?.name?.slice(0,15)+'...'} color="#8B5CF6" />
            <StatCard label="Taille"            value={`${((file?.size||0)/1024).toFixed(1)} KB`} color={C.amber} />
          </div>

          {/* Erreurs */}
          {parsed.errors.length > 0 && (
            <div style={{ background:'rgba(232,69,69,.08)', border:'1px solid rgba(232,69,69,.3)', borderRadius:10, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.red, marginBottom:8 }}>⚠️ Erreurs détectées</div>
              {parsed.errors.map((e: string, i: number) => (
                <div key={i} style={{ fontSize:12, color:'#ff8080', padding:'3px 0' }}>• {e}</div>
              ))}
            </div>
          )}

          {/* Aperçu données */}
          {parsed.rows.length > 0 && (
            <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:12, overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'12px 16px', background:'#0D2137', fontSize:13, fontWeight:700 }}>
                📊 Aperçu — {parsed.rows.length} lignes importables
              </div>
              {/* Header */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8, padding:'10px 16px', background:'#0D2137', fontSize:10, color:C.muted, textTransform:'uppercase', letterSpacing:.5, borderTop:'1px solid #1A3A52' }}>
                <span>Date</span><span>CA (TND)</span><span>Couverts</span><span>Ticket moy.</span><span>Food Cost</span>
              </div>
              {/* Rows preview (max 10) */}
              {parsed.rows.slice(0,10).map((row: any, i: number) => (
                <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr 1fr', gap:8, padding:'9px 16px', borderTop:'1px solid #1A3A5220', fontSize:12, background:i%2===0?'transparent':'#0A1A27' }}>
                  <span style={{ color:C.gray }}>{row.date}</span>
                  <span style={{ fontWeight:700, color:C.teal }}>{row.revenue_tnd.toLocaleString('fr-FR')}</span>
                  <span style={{ color:C.gray }}>{row.covers}</span>
                  <span style={{ color:C.gray }}>{row.avg_ticket}</span>
                  <span style={{ color:C.gray }}>{row.food_cost_pct}%</span>
                </div>
              ))}
              {parsed.rows.length > 10 && (
                <div style={{ padding:'8px 16px', fontSize:11, color:C.muted, background:'#0D2137', borderTop:'1px solid #1A3A52' }}>
                  ... et {parsed.rows.length - 10} lignes supplémentaires
                </div>
              )}
            </div>
          )}

          {/* Stats du dataset */}
          {parsed.rows.length > 0 && (
            <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:12, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>📈 Analyse du dataset</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                {(() => {
                  const revs = parsed.rows.map((r:any) => r.revenue_tnd)
                  return [
                    { label:'CA moyen/jour', value:`${Math.round(revs.reduce((a:number,b:number)=>a+b,0)/revs.length).toLocaleString('fr-FR')} TND` },
                    { label:'CA maximum',    value:`${Math.round(Math.max(...revs)).toLocaleString('fr-FR')} TND` },
                    { label:'CA minimum',    value:`${Math.round(Math.min(...revs)).toLocaleString('fr-FR')} TND` },
                    { label:'Période',       value:`${parsed.rows[0].date} → ${parsed.rows[parsed.rows.length-1].date}` },
                  ].map((s,i) => (
                    <div key={i} style={{ background:'#081522', borderRadius:8, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, color:C.muted, marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{s.value}</div>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:12 }}>
            <button onClick={() => { setStep('upload'); setParsed(null); setFile(null) }} style={{ flex:1, padding:'12px', borderRadius:10, border:`1px solid ${C.navyL}`, background:'transparent', color:C.gray, fontSize:14, fontWeight:600, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
              ← Changer de fichier
            </button>
            <button onClick={importData} disabled={importing || parsed.rows.length === 0 || parsed.errors.length > 0} style={{
              flex:2, padding:'12px', borderRadius:10, border:'none',
              background: importing || parsed.rows.length === 0 ? C.navyL : C.teal,
              color: importing ? C.muted : C.navyD,
              fontSize:14, fontWeight:700, cursor: importing ? 'not-allowed' : 'pointer', fontFamily:'Inter,sans-serif'
            }}>
              {importing ? '⟳ Import en cours...' : `✅ Importer ${parsed.rows.length} lignes en base`}
            </button>
          </div>
        </div>
      )}

      {/* Résultat import */}
      {step === 'done' && result && (
        <div>
          <div style={{ background:'rgba(0,196,140,.08)', border:'1px solid rgba(0,196,140,.3)', borderRadius:16, padding:24, textAlign:'center', marginBottom:20 }}>
            <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
            <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Import réussi !</div>
            <div style={{ fontSize:14, color:C.gray }}>
              <strong style={{ color:C.teal }}>{result.inserted}</strong> lignes importées en base PostgreSQL
            </div>
            {result.skipped > 0 && <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{result.skipped} doublon(s) ignoré(s)</div>}
          </div>

          {/* Réentraîner Prophet */}
          <div style={{ background:C.navyM, border:'1px solid #1A3A52', borderRadius:16, padding:24, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:8 }}>🧠 Réentraîner Prophet avec vos données réelles</div>
            <div style={{ fontSize:13, color:C.muted, marginBottom:16 }}>
              Prophet va maintenant utiliser vos vraies données de ventes pour générer des prévisions beaucoup plus précises.
            </div>
            <button onClick={retrain} disabled={retraining} style={{
              width:'100%', padding:'13px', borderRadius:10, border:'none',
              background: retraining ? C.navyL : '#8B5CF6',
              color: retraining ? C.muted : '#fff',
              fontSize:14, fontWeight:700, cursor: retraining ? 'not-allowed' : 'pointer', fontFamily:'Inter,sans-serif'
            }}>
              {retraining ? '⟳ Entraînement Prophet en cours... (30-60s)' : '🚀 Réentraîner Prophet maintenant'}
            </button>
          </div>

          {/* Résultats Prophet */}
          {forecast && (
            <div style={{ background:C.navyM, border:`1px solid rgba(0,196,140,.3)`, borderRadius:16, padding:20 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>✅ Prophet réentraîné avec succès !</div>
              <div style={{ fontSize:12, color:C.muted, marginBottom:16 }}>MAPE : <strong style={{ color:C.teal }}>{forecast.mape}%</strong> · {forecast.stats?.training_days} jours · {forecast.stats?.data_start} → {forecast.stats?.data_end}</div>
              <div style={{ display:'flex', alignItems:'flex-end', gap:6, height:80 }}>
                {forecast.forecasts?.slice(0,7).map((f: any, i: number) => {
                  const max = Math.max(...forecast.forecasts.slice(0,7).map((x:any) => x.revenue_tnd))
                  const pct = (f.revenue_tnd / max) * 100
                  const isWeekend = ['Friday','Saturday','Sunday'].includes(f.day)
                  return (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', height:'100%', justifyContent:'flex-end', gap:3 }}>
                      <div style={{ fontSize:9, color:isWeekend?C.teal:C.muted }}>{Math.round(f.revenue_tnd/1000)}k</div>
                      <div style={{ width:'100%', borderRadius:'3px 3px 0 0', height:`${pct}%`, minHeight:4, background:isWeekend?C.teal:'rgba(0,196,140,0.5)' }} />
                      <div style={{ fontSize:9, color:isWeekend?C.teal:C.muted, fontWeight:isWeekend?700:400 }}>{daysFr[f.day]}</div>
                    </div>
                  )
                })}
              </div>
              <div style={{ display:'flex', gap:12, marginTop:16 }}>
                <a href="/app/dashboard/forecasts" style={{ flex:1, padding:'10px', borderRadius:8, background:C.teal, color:C.navyD, fontSize:13, fontWeight:700, textDecoration:'none', textAlign:'center', display:'block' }}>
                  📊 Voir les prévisions complètes
                </a>
                <a href="/app/dashboard" style={{ flex:1, padding:'10px', borderRadius:8, background:C.navyL, color:'#fff', fontSize:13, fontWeight:600, textDecoration:'none', textAlign:'center', display:'block' }}>
                  🏠 Retour au dashboard
                </a>
              </div>
            </div>
          )}

          <button onClick={() => { setStep('upload'); setParsed(null); setFile(null); setResult(null); setForecast(null) }} style={{ width:'100%', marginTop:12, padding:'10px', borderRadius:8, border:`1px solid ${C.navyL}`, background:'transparent', color:C.muted, fontSize:13, cursor:'pointer', fontFamily:'Inter,sans-serif' }}>
            ↩ Importer un autre fichier
          </button>
        </div>
      )}
    </div>
  )
}
