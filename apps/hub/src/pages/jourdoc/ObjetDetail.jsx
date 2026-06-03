import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, buildPathMap } from './hooks'
import { sortedIds } from './calUtils'
import NoteCard from './NoteCard'

export default function ObjetDetail() {
  const { wsId, objetId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { objets } = useJdData(wsId, token)

  const [notes, setNotes] = useState([])
  const [direction, setDirection] = useState('both')
  const [loading, setLoading] = useState(true)

  const objet = objets.find(o => o.id === Number(objetId))

  function newNoteForObjet() {
    navigate(`/jourdoc/${wsId}/new`, { state: { objet_ids: [Number(objetId)] } })
  }

  useEffect(() => {
    setLoading(true)
    fetch(API_ROUTES.JD_OBJET_NOTES(wsId, objetId) + `?direction=${direction}`, {
      headers: authHeader(token)
    })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, objetId, token, direction])

  // Chemin depuis la racine
  const pathMap = buildPathMap(objets)
  const path = pathMap.get(Number(objetId)) ?? ''

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: '.125rem' }}>{objet?.nom ?? `Objet #${objetId}`}</h2>
          {path && <span className="jd-path-label">{path}</span>}
        </div>
        <button className="btn btn-primary" style={{ padding: '.4rem .875rem', fontSize: '.8125rem', flexShrink: 0 }}
          onClick={newNoteForObjet}>+ Note</button>
      </div>

      {objet?.description && (
        <p className="jd-objet-desc">{objet.description}</p>
      )}

      {/* Contrôle direction de recherche */}
      <div className="jd-direction-ctrl">
        <span className="form-label" style={{ marginRight: '.5rem' }}>Portée de la recherche :</span>
        <div className="jd-segmented" style={{ display: 'inline-flex' }}>
          {[['both', '↕ Les deux'], ['down', '↓ Descendants'], ['up', '↑ Ancêtres']].map(([v, l]) => (
            <button key={v} type="button"
              className={`jd-seg-btn${direction === v ? ' active' : ''}`}
              onClick={() => setDirection(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <p>Aucune note pour cet objet.</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {notes.map(note => <NoteCard key={note.id} note={note} contextNoteIds={sortedIds(notes)} />)}
        </div>
      )}
    </div>
  )
}
