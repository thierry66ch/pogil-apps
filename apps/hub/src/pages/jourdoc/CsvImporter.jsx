import { useState, useRef } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

// ── Parseur CSV client-side (prévisualisation) ────────────────

function parseCSVClient(raw) {
  let text = raw
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1)
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    .filter(l => l.trim() && !l.trim().startsWith('#'))
  if (lines.length < 2) return null
  const sep = lines[0].includes(';') ? ';' : ','
  const split = l => l.split(sep).map(c => c.trim().replace(/^["'](.*)["']$/, '$1'))
  const headers = split(lines[0]).map(h => h.toLowerCase())
  const rows = lines.slice(1)
    .map(line => Object.fromEntries(headers.map((h, i) => [split(line)[i] ?? '', h]).map(([v, h]) => [h, v])))
    .filter(r => Object.values(r).some(v => v.trim()))
  return { headers, rows, sep }
}

function computeDepth(chemin) {
  return (chemin.match(/\//g) ?? []).length
}

// ── Exemples de format ────────────────────────────────────────

const EXAMPLES = {
  objets: `chemin;nom_court;est_individu;description
Arbres;arb;0;
Arbres/Arbres fruitiers;fru;0;
Arbres/Arbres fruitiers/Pommiers;pom;0;
Arbres/Arbres fruitiers/Pommiers/Pommier Golden;gol;1;Variété Golden Délicieux
Potager;pot;0;
Potager/Tomates;tom;0;
Potager/Tomates/Tomate Cœur de Bœuf;cdb;1;`,

  themes: `chemin;nom_court
Installation;ins
Installation/Semer;sem
Installation/Planter;pla
Installation/Repiquer;rep
Entretien;ent
Entretien/Taille;tai
Entretien/Arrosage;arr
Traitement;tra
Traitement/Traitement antifongique;taf
Récolte;rec
Récolte/Cueillette;cui
Observation;obs`,
}

// ── Composant principal ───────────────────────────────────────

export default function CsvImporter({ wsId, token, type = 'objets', onDone }) {
  const [csvText, setCsvText]     = useState('')
  const [preview, setPreview]     = useState(null)
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState('')
  const [showExample, setShowExample] = useState(false)
  const fileRef = useRef(null)

  function handleChange(text) {
    setCsvText(text)
    setResult(null)
    setError('')
    setPreview(text.trim() ? parseCSVClient(text) : null)
  }

  function loadExample() {
    handleChange(EXAMPLES[type])
  }

  function loadFile(file) {
    const reader = new FileReader()
    reader.onload = e => handleChange(e.target.result)
    reader.readAsText(file, 'UTF-8')
  }

  async function doImport() {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const url = type === 'objets' ? API_ROUTES.JD_IMPORT_OBJETS(wsId) : API_ROUTES.JD_IMPORT_THEMES(wsId)
      const res = await fetch(url, {
        method: 'POST', headers: authHeader(token),
        body: JSON.stringify({ csv: csvText }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Erreur serveur'); return }
      setResult(data)
      onDone?.()
    } catch { setError('Erreur réseau') }
    finally { setLoading(false) }
  }

  const hasPath = preview?.headers.includes('chemin') || preview?.headers.includes('path')

  return (
    <div className="csv-importer">
      {/* Aide format */}
      <div className="csv-importer__help">
        <button type="button" className="jd-auto-btn"
          onClick={() => setShowExample(o => !o)}>
          {showExample ? 'Masquer l'exemple' : '📋 Voir le format attendu'}
        </button>
        <button type="button" className="jd-auto-btn"
          onClick={loadExample}>
          ↓ Charger l'exemple
        </button>
      </div>

      {showExample && (
        <pre className="csv-importer__example">{EXAMPLES[type]}</pre>
      )}

      {/* Upload fichier */}
      <div className="csv-importer__upload"
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadFile(f) }}
        onClick={() => fileRef.current?.click()}>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files[0]; if (f) loadFile(f) }} />
        <span>📂 Déposer un fichier CSV ici ou <strong>cliquer pour choisir</strong></span>
      </div>

      {/* Ou coller */}
      <div className="form-field">
        <label className="form-label">Ou coller le CSV directement</label>
        <textarea
          className="input"
          style={{ fontFamily: 'var(--font-mono)', fontSize: '.8125rem', minHeight: '120px', resize: 'vertical' }}
          value={csvText}
          onChange={e => handleChange(e.target.value)}
          placeholder={`chemin;nom_court;...\nArbres;arb;0\nArbres/Fruitiers;fru;0\n…`}
        />
      </div>

      {/* Prévisualisation */}
      {preview && preview.rows.length > 0 && (
        <div className="csv-importer__preview">
          <div className="csv-importer__preview-header">
            <span>Prévisualisation — {preview.rows.length} ligne{preview.rows.length > 1 ? 's' : ''} · séparateur «&nbsp;{preview.sep}&nbsp;»</span>
          </div>
          <div className="csv-importer__preview-body">
            <table className="csv-importer__table">
              <thead>
                <tr>{preview.headers.map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 15).map((row, i) => {
                  const chemin = row.chemin || row.path || ''
                  const depth = hasPath ? computeDepth(chemin) : 0
                  return (
                    <tr key={i}>
                      {preview.headers.map(h => (
                        <td key={h}>
                          {h === 'chemin' || h === 'path'
                            ? <span style={{ paddingLeft: `${depth * 1rem}` }}>{row[h]}</span>
                            : row[h]}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {preview.rows.length > 15 && (
              <p style={{ color: 'var(--text-muted)', fontSize: '.8125rem', padding: '.5rem' }}>
                … et {preview.rows.length - 15} lignes supplémentaires
              </p>
            )}
          </div>
        </div>
      )}

      {preview && preview.rows.length === 0 && (
        <p className="msg msg-error">Aucune ligne détectée — vérifiez le format.</p>
      )}

      {/* Erreur */}
      {error && <p className="msg msg-error">{error}</p>}

      {/* Résultat */}
      {result && (
        <div className="csv-importer__result">
          <span className="csv-importer__result-ok">✅ {result.created} créé{result.created !== 1 ? 's' : ''}</span>
          <span className="csv-importer__result-skip">⏭ {result.skipped} déjà existant{result.skipped !== 1 ? 's' : ''}</span>
          {result.errors?.length > 0 && (
            <span className="csv-importer__result-err">⚠️ {result.errors.length} erreur{result.errors.length > 1 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Bouton import */}
      <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
        <button className="btn btn-primary"
          disabled={!preview || preview.rows.length === 0 || loading}
          onClick={doImport}>
          {loading ? '…' : `📥 Importer ${preview?.rows.length ?? 0} ligne${(preview?.rows.length ?? 0) !== 1 ? 's' : ''}`}
        </button>
        {csvText && (
          <button className="btn btn-ghost" onClick={() => { setCsvText(''); setPreview(null); setResult(null) }}>
            Effacer
          </button>
        )}
      </div>
    </div>
  )
}
