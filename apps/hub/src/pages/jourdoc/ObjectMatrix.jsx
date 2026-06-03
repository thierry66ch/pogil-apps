import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { daysOfMonth, fmtDay, toISO } from './calUtils'

const NATURE_BG  = { observation: 'var(--success-bg)', activite: 'var(--accent-bg)', documentation: 'rgba(245,158,11,.12)' }
const NATURE_FG  = { observation: 'var(--success)',    activite: 'var(--accent)',     documentation: '#d97706' }
const NATURE_ICO = { observation: '👁', activite: '⚡', documentation: '📄' }

function CellDots({ dayNotes, small }) {
  if (!dayNotes?.length) return null
  const sz = small ? '6px' : '8px'
  const max = small ? 3 : 4
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px', justifyContent: 'center', padding: '2px' }}>
      {dayNotes.slice(0, max).map((n, i) => (
        <span key={i} style={{
          width: sz, height: sz, borderRadius: '50%',
          background: NATURE_FG[n.nature ?? n.type] ?? 'var(--text-muted)',
          flexShrink: 0,
        }} />
      ))}
      {dayNotes.length > max && (
        <span style={{ fontSize: '7px', color: 'var(--text-muted)', lineHeight: 1 }}>+{dayNotes.length - max}</span>
      )}
    </div>
  )
}

export default function ObjectMatrix({ notes, objets, year, month }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const [popup, setPopup] = useState(null)  // { objId, objNom, iso, notes }

  const days = useMemo(() => daysOfMonth(year, month), [year, month])
  const todayISO = toISO(new Date())

  // Construire la matrice: Map<objId, Map<iso, Note[]>>
  const matrix = useMemo(() => {
    const m = new Map()
    for (const n of notes) {
      for (const obj of (n.objets ?? [])) {
        if (!m.has(obj.id)) m.set(obj.id, new Map())
        const dm = m.get(obj.id)
        if (!dm.has(n.date)) dm.set(n.date, [])
        dm.get(n.date).push(n)
      }
    }
    return m
  }, [notes])

  // Objets qui ont au moins 1 note sur la période + leurs ancêtres
  const activeIds = useMemo(() => {
    const ids = new Set()
    for (const [id] of matrix) ids.add(id)
    // Ajouter les ancêtres pour garder la hiérarchie
    const objMap = new Map(objets.map(o => [o.id, o]))
    const toAdd = new Set(ids)
    for (const id of ids) {
      let o = objMap.get(id)
      while (o?.parent_id) {
        toAdd.add(o.parent_id)
        o = objMap.get(o.parent_id)
      }
    }
    return toAdd
  }, [matrix, objets])

  // Hiérarchie aplatie (seulement actifs)
  const flatObj = useMemo(() => {
    const objMap = new Map(objets.map(o => [o.id, { ...o, children: [] }]))
    const roots = []
    for (const node of objMap.values()) {
      if (node.parent_id && objMap.has(node.parent_id)) objMap.get(node.parent_id).children.push(node)
      else roots.push(node)
    }
    const result = []
    function traverse(node, depth) {
      if (!activeIds.has(node.id) && !node.children.some(c => activeIds.has(c.id))) return
      result.push({ ...node, depth })
      node.children.slice().sort((a, b) => a.nom.localeCompare(b.nom)).forEach(c => traverse(c, depth + 1))
    }
    roots.sort((a, b) => a.nom.localeCompare(b.nom)).forEach(r => traverse(r, 0))
    return result
  }, [objets, activeIds])

  // Abbréviations de jours (1-chiffre + initiale)
  const dayLabels = days.map(iso => {
    const d = new Date(iso + 'T00:00:00')
    return { iso, num: d.getDate(), wd: ['Di','Lu','Ma','Me','Je','Ve','Sa'][d.getDay()] }
  })

  function openCell(obj, iso, dayNotes) {
    if (!dayNotes.length) {
      navigate(`/jourdoc/${wsId}/new`, { state: { note_date: iso, objet_ids: [obj.id] } })
    } else {
      setPopup({ objId: obj.id, objNom: obj.nom, iso, notes: dayNotes })
    }
  }

  if (flatObj.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📊</div>
        <p>Aucune activité ce mois.</p>
      </div>
    )
  }

  return (
    <div className="obj-matrix-wrap">
      <div className="obj-matrix">
        {/* Colonnes : header collant */}
        <div className="obj-matrix__head">
          <div className="obj-matrix__obj-col obj-matrix__obj-col--head">Objet</div>
          {dayLabels.map(({ iso, num, wd }) => (
            <div key={iso} className={`obj-matrix__day-head${iso === todayISO ? ' today' : ''}`}>
              <span className="obj-matrix__wd">{wd}</span>
              <span className="obj-matrix__dn">{num}</span>
            </div>
          ))}
        </div>

        {/* Lignes : objets */}
        {flatObj.map(obj => {
          const objNotes = matrix.get(obj.id)
          const hasAny = objNotes && objNotes.size > 0
          return (
            <div key={obj.id} className={`obj-matrix__row${hasAny ? ' has-activity' : ''}`}>
              {/* Nom de l'objet (collant à gauche) */}
              <div className="obj-matrix__obj-col" style={{ paddingLeft: `${0.5 + obj.depth * 0.875}rem` }}>
                <span
                  className={`obj-matrix__obj-name${obj.est_individu ? ' individu' : ' groupe'}`}
                  onClick={() => navigate(`/jourdoc/${wsId}/objet/${obj.id}`)}
                  title="Fiche objet"
                >
                  {!obj.est_individu && <span className="obj-matrix__arrow">▸</span>}
                  {obj.nom}
                </span>
              </div>

              {/* Cellules jours */}
              {dayLabels.map(({ iso }) => {
                const dayNotes = objNotes?.get(iso) ?? []
                const hasNotes = dayNotes.length > 0
                const isToday = iso === todayISO
                // Couleur dominante
                const dominant = dayNotes.find(n => n.nature === 'activite') ?? dayNotes[0]
                const bg = hasNotes ? (NATURE_BG[dominant?.nature ?? dominant?.type] ?? 'var(--accent-bg)') : ''
                return (
                  <div
                    key={iso}
                    className={`obj-matrix__cell${hasNotes ? ' has-notes' : ''}${isToday ? ' today' : ''}`}
                    style={hasNotes ? { background: bg } : {}}
                    onClick={() => openCell(obj, iso, dayNotes)}
                    title={hasNotes
                      ? `${obj.nom} · ${fmtDay(iso)} · ${dayNotes.length} note(s)`
                      : `Nouvelle note : ${obj.nom} · ${fmtDay(iso)}`}
                  >
                    <CellDots dayNotes={dayNotes} />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      {/* Popup cellule */}
      {popup && (
        <div className="matrix-popup-overlay" onClick={() => setPopup(null)}>
          <div className="matrix-popup" onClick={e => e.stopPropagation()}>
            <div className="matrix-popup__header">
              <strong>{popup.objNom}</strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '.8125rem' }}>{fmtDay(popup.iso)}</span>
              <button className="matrix-popup__close" onClick={() => setPopup(null)}>×</button>
            </div>
            {popup.notes.map(n => (
              <button key={n.id} className="matrix-popup__note"
                onClick={() => { setPopup(null); navigate(`/jourdoc/${wsId}/notes/${n.id}`) }}>
                <span style={{ fontSize: '1rem' }}>{NATURE_ICO[n.nature ?? n.type] ?? '📔'}</span>
                <span className="matrix-popup__titre">{n.titre}</span>
              </button>
            ))}
            <button className="matrix-popup__new"
              onClick={() => { setPopup(null); navigate(`/jourdoc/${wsId}/new`, { state: { note_date: popup.iso, objet_ids: [popup.objId] } }) }}>
              + Nouvelle note pour cet objet ce jour
            </button>
          </div>
        </div>
      )}

      {/* Légende */}
      <div className="cal-legend" style={{ marginTop: '1.25rem' }}>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--obs" />Observation</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--act" />Activité</span>
        <span className="cal-legend__item"><span className="cal-dot cal-dot--doc" />Documentation</span>
        <span className="cal-legend__item" style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Clic sur une cellule vide → nouvelle note</span>
      </div>
    </div>
  )
}
