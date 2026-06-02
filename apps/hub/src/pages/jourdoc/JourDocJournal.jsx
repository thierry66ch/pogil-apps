import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import NoteCard from './NoteCard'

function isoToday() { return new Date().toISOString().slice(0, 10) }
function fmtDate(iso) {
  if (!iso) return ''
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}
function shiftDate(iso, days) {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export default function JourDocJournal() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()

  const [date, setDate] = useState(isoToday())
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = API_ROUTES.JD_NOTES(wsId) + `?date_from=${date}&date_to=${date}`
    fetch(url, { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setNotes(data.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, date])

  return (
    <div className="jd-journal">
      {/* Sélecteur de date */}
      <div className="jd-journal__nav">
        <button className="jd-date-arrow" onClick={() => setDate(d => shiftDate(d, -1))}>‹</button>
        <div className="jd-journal__date-wrap">
          <span className="jd-journal__date">{fmtDate(date)}</span>
          <input type="date" className="jd-date-hidden" value={date}
            onChange={e => setDate(e.target.value)} />
        </div>
        <button className="jd-date-arrow" onClick={() => setDate(d => shiftDate(d, 1))}
          disabled={date >= isoToday()}>›</button>
        {date !== isoToday() && (
          <button className="btn btn-ghost" style={{ fontSize: '.8rem', padding: '.3rem .6rem' }}
            onClick={() => setDate(isoToday())}>Aujourd'hui</button>
        )}
      </div>

      {/* Liste des notes */}
      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : notes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">📔</div>
          <p>Aucune note ce jour.</p>
        </div>
      ) : (
        <div className="jd-notes-list">
          {notes.map(note => <NoteCard key={note.id} note={note} />)}
        </div>
      )}

      {/* FAB nouvelle note */}
      <button className="jd-fab" onClick={() => navigate(`/jourdoc/${wsId}/new`)} title="Nouvelle note">
        +
      </button>
    </div>
  )
}
