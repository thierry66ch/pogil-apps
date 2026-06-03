import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader, buildPathMap } from './hooks'
import { sortedIds } from './calUtils'
import NoteCard from './NoteCard'

export default function ThemeDetail() {
  const { wsId, themeId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { themes } = useJdData(wsId, token)

  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const theme = themes.find(t => t.id === Number(themeId))
  const pathMap = buildPathMap(themes)
  const path = pathMap.get(Number(themeId)) ?? ''

  useEffect(() => {
    setLoading(true)
    fetch(`${API_ROUTES.JD_NOTES(wsId)}?theme_id=${themeId}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, themeId, token])

  return (
    <div className="jd-objet-detail">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <div>
          <h2 style={{ marginBottom: '.125rem' }}>🏷️ {theme?.nom ?? `Thème #${themeId}`}</h2>
          {path && <span className="jd-path-label">{path}</span>}
        </div>
      </div>

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📋</div>
          <p>Aucune note pour ce thème.</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {notes.map(note => <NoteCard key={note.id} note={note} contextNoteIds={sortedIds(notes)} />)}
        </div>
      )}
    </div>
  )
}
