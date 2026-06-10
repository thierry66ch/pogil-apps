import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, useJdData } from './hooks'
import { weekBucket, monthSpansFor52 } from './calUtils'
import HierarchyPicker from './HierarchyPicker'

const MONTHS_FR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc']
const NATURE_COLOR = { observation: 'var(--success)', activite: 'var(--accent)', documentation: '#f59e0b', journal: 'var(--text-muted)' }
const DIR_OPTS = [['both','↕'],['down','↓'],['up','↑']]

export default function AnalyseView() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate  = useNavigate()
  const { objets, themes } = useJdData(wsId, token)

  const [objetFilter,    setObjetFilter]    = useState(null)
  const [objetDir,       setObjetDir]       = useState('both')
  const [themeFilter,    setThemeFilter]    = useState(null)
  const [themeDir,       setThemeDir]       = useState('both')
  const [nature,         setNature]         = useState('both')
  const [notes,          setNotes]          = useState([])
  const [loading,        setLoading]        = useState(false)

  const hasFilter = objetFilter != null || themeFilter != null

  useEffect(() => {
    if (!hasFilter) { setNotes([]); return }
    const params = new URLSearchParams()
    if (objetFilter) { params.set('objet_id', objetFilter); params.set('objet_dir', objetDir) }
    if (themeFilter) { params.set('theme_id', themeFilter); params.set('theme_dir', themeDir) }
    if (nature !== 'both') params.set('nature', nature)
    setLoading(true)
    fetch(`${API_ROUTES.JD_ANALYSE(wsId)}?${params}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, objetFilter, objetDir, themeFilter, themeDir, nature])

  // Groupe les notes par (year, bucket)
  const byYearBucket = useMemo(() => {
    const map = new Map()
    for (const n of notes) {
      if (!n.date) continue
      const { year, bucket } = weekBucket(n.date)
      const key = `${year}/${bucket}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(n)
    }
    return map
  }, [notes])

  const years = useMemo(() => {
    if (notes.length === 0) return []
    const ys = [...new Set(notes.map(n => weekBucket(n.date).year))].sort()
    // Compléter pour avoir toutes les années entre min et max
    const min = ys[0], max = ys[ys.length - 1]
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }, [notes])

  const refYear = new Date().getFullYear()
  const monthSpans = useMemo(() => monthSpansFor52(refYear), [refYear])

  // Buckets marquant le début d'un nouveau mois (pour bordure plus épaisse)
  const monthStarts = useMemo(() => {
    const jan1 = new Date(refYear, 0, 1)
    const starts = new Set()
    let cur = -1
    for (let b = 0; b < 52; b++) {
      const m = new Date(jan1.getTime() + b * 604800000).getMonth()
      if (m !== cur) { starts.add(b); cur = m }
    }
    return starts
  }, [refYear])

  const BUCKETS = 52

  return (
    <div className="jd-analyse">
      {/* Filtres */}
      <div className="jd-analyse__filters">
        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Objet</span>
          <div className="jd-analyse__picker">
            <HierarchyPicker items={objets} value={objetFilter}
              onChange={v => { setObjetFilter(v); if (!v) setObjetDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Rechercher un objet…" />
          </div>
          {objetFilter && (
            <div className="jd-segmented">
              {DIR_OPTS.map(([v, l]) => (
                <button key={v} type="button" className={`jd-seg-btn${objetDir === v ? ' active' : ''}`}
                  onClick={() => setObjetDir(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Thème</span>
          <div className="jd-analyse__picker">
            <HierarchyPicker items={themes} value={themeFilter}
              onChange={v => { setThemeFilter(v); if (!v) setThemeDir('both') }}
              nullable nullLabel="— Tous —" placeholder="Rechercher un thème…" />
          </div>
          {themeFilter && (
            <div className="jd-segmented">
              {DIR_OPTS.map(([v, l]) => (
                <button key={v} type="button" className={`jd-seg-btn${themeDir === v ? ' active' : ''}`}
                  onClick={() => setThemeDir(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>

        <div className="jd-analyse__filter-row">
          <span className="jd-analyse__filter-label">Nature</span>
          <div className="jd-segmented">
            {[['both','↕ Tout'],['observation','👁 Obs.'],['activite','⚡ Act.']].map(([v, l]) => (
              <button key={v} type="button" className={`jd-seg-btn${nature === v ? ' active' : ''}`}
                onClick={() => setNature(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Invite si aucun filtre */}
      {!hasFilter && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <div className="empty-state__icon">📊</div>
          <p>Sélectionnez au moins un objet ou un thème pour visualiser l'historique pluriannuel.</p>
        </div>
      )}

      {loading && <div className="jd-loading">Chargement…</div>}

      {/* Tableau */}
      {!loading && hasFilter && notes.length === 0 && (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <p>Aucune note correspondant aux filtres.</p>
        </div>
      )}

      {!loading && years.length > 0 && (
        <div className="jd-analyse__wrap">
          <table className="jd-analyse__table">
            <colgroup>
              <col className="jd-analyse__col-year" />
              {Array.from({ length: BUCKETS }, (_, i) => <col key={i} />)}
            </colgroup>
            <thead>
              {/* Ligne mois */}
              <tr>
                <th className="jd-analyse__th-year" />
                {monthSpans.map(({ month, count }, i) => (
                  <th key={i} colSpan={count} className="jd-analyse__th-month">
                    {MONTHS_FR_SHORT[month]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {years.map(year => (
                <tr key={year}>
                  <td className="jd-analyse__td-year">{year}</td>
                  {Array.from({ length: BUCKETS }, (_, b) => {
                    const cellNotes = byYearBucket.get(`${year}/${b}`) ?? []
                    const classes = [
                      'jd-analyse__cell',
                      cellNotes.length ? 'jd-analyse__cell--has' : '',
                      monthStarts.has(b) ? 'jd-analyse__cell--month-start' : '',
                    ].filter(Boolean).join(' ')
                    return (
                      <td key={b} className={classes}>
                        {cellNotes.length > 0 && (
                          <div className="jd-analyse__dots">
                            {cellNotes.slice(0, 4).map((n, i) => (
                              <span key={i} className="jd-analyse__dot"
                                style={{ background: NATURE_COLOR[n.nature ?? n.type] ?? NATURE_COLOR.journal }} />
                            ))}
                            {cellNotes.length > 4 && <span className="jd-analyse__dot-more">+{cellNotes.length - 4}</span>}
                          </div>
                        )}
                        {/* Popup au survol */}
                        {cellNotes.length > 0 && (
                          <div className="jd-analyse__popup">
                            <div className="jd-analyse__popup-head">
                              Sem. {b + 1} · {year} · {cellNotes.length} note{cellNotes.length > 1 ? 's' : ''}
                            </div>
                            {cellNotes.slice(0, 6).map(n => (
                              <button key={n.id} className="jd-analyse__popup-item"
                                onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)}>
                                {n.titre_alt ?? n.titre}
                              </button>
                            ))}
                            {cellNotes.length > 6 && <span className="jd-analyse__popup-more">+{cellNotes.length - 6} autres</span>}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
