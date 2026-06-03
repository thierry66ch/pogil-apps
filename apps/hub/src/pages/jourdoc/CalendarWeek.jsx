import { useNavigate, useParams } from 'react-router-dom'
import { daysOfWeek, fmtDayShort, fmtWeekday, toISO } from './calUtils'
import NoteCard from './NoteCard'

export default function CalendarWeek({ notes, anchor }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const days = daysOfWeek(anchor)
  const todayISO = toISO(new Date())

  const noteMap = new Map()
  for (const n of notes) {
    if (!noteMap.has(n.date)) noteMap.set(n.date, [])
    noteMap.get(n.date).push(n)
  }

  return (
    <div className="cal-week">
      {days.map(iso => {
        const dayNotes = noteMap.get(iso) ?? []
        const isToday = iso === todayISO
        return (
          <div key={iso} className={`cal-week-col${isToday ? ' cal-week-col--today' : ''}`}>
            {/* En-tête du jour */}
            <div className="cal-week-col__header">
              <span className="cal-week-col__wd">{fmtWeekday(iso)}</span>
              <span className={`cal-week-col__num${isToday ? ' today' : ''}`}>
                {new Date(iso + 'T00:00:00').getDate()}
              </span>
              <span className="cal-week-col__mo">
                {new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { month: 'short' })}
              </span>
            </div>

            {/* Notes du jour */}
            <div className="cal-week-col__notes">
              {dayNotes.map(n => <NoteCard key={n.id} note={n} />)}
              {/* Bouton + rapide */}
              <button
                className="cal-week-col__add"
                onClick={() => navigate(`/jourdoc/${wsId}/new`, { state: { note_date: iso } })}
                title={`Nouvelle note le ${fmtDayShort(iso)}`}
              >+</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
