import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { weeksOfYear, toISO, sortedIds } from './calUtils'
import NoteCard from './NoteCard'

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin',
                   'Juillet','Août','Septembre','Octobre','Novembre','Décembre']
const NATURE_COLOR = { observation: 'obs', activite: 'act', documentation: 'doc', journal: 'jrn' }
function dotClass(n) { return NATURE_COLOR[n.nature ?? n.type] ?? 'jrn' }

export default function CalendarYear({ notes, year }) {
  const { wsId } = useParams()
  const navigate = useNavigate()
  const [selectedWeek, setSelectedWeek] = useState(null) // monday ISO

  const weeks = weeksOfYear(year)
  const todayISO = toISO(new Date())

  // Indexer les notes par date
  const noteMap = new Map()
  for (const n of notes) {
    if (!noteMap.has(n.date)) noteMap.set(n.date, [])
    noteMap.get(n.date).push(n)
  }

  // Agréger les notes d'une semaine (lundi→dimanche)
  function weekNotes(monday, sunday) {
    const result = []
    const d = new Date(monday + 'T00:00:00')
    const end = new Date(sunday + 'T00:00:00')
    while (d <= end) {
      const iso = toISO(d)
      const dayNotes = noteMap.get(iso) ?? []
      result.push(...dayNotes)
      d.setDate(d.getDate() + 1)
    }
    return result
  }

  // Grouper les semaines par mois (mois du lundi)
  const byMonth = []
  for (let m = 0; m < 12; m++) {
    byMonth.push(weeks.filter(w => w.month === m))
  }

  const selectedNotes = selectedWeek
    ? (() => {
        const w = weeks.find(x => x.monday === selectedWeek)
        return w ? weekNotes(w.monday, w.sunday) : []
      })()
    : []

  return (
    <div className="cal-year">
      {byMonth.map((monthWeeks, m) => {
        if (monthWeeks.length === 0) return null
        return (
          <div key={m} className="cal-year__month">
            <div className="cal-year__month-label">{MONTHS_FR[m]}</div>
            <div className="cal-year__weeks">
              {monthWeeks.map(({ monday, sunday }) => {
                const wNotes = weekNotes(monday, sunday)
                const dayNum = new Date(monday + 'T00:00:00').getDate()
                const isSelected = monday === selectedWeek
                const containsToday = monday <= todayISO && todayISO <= sunday

                return (
                  <div key={monday}
                    className={[
                      'cal-year__cell',
                      isSelected ? 'cal-year__cell--selected' : '',
                      containsToday ? 'cal-year__cell--today' : '',
                      wNotes.length ? 'cal-year__cell--has-notes' : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setSelectedWeek(isSelected ? null : monday)}
                    title={`${monday} → ${sunday}`}
                  >
                    <span className="cal-year__day">{dayNum}</span>
                    <div className="cal-cell__dots">
                      {wNotes.slice(0, 8).map((n, i) => (
                        <span key={i} className={`cal-dot cal-dot--${dotClass(n)}`} />
                      ))}
                      {wNotes.length > 8 && <span className="cal-dot-more">+{wNotes.length - 8}</span>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Panneau notes de la semaine sélectionnée (si dans ce mois) */}
            {selectedWeek && monthWeeks.some(w => w.monday === selectedWeek) && selectedNotes.length > 0 && (
              <div className="cal-year__expanded">
                <div className="cal-year__expanded-header">
                  {(() => {
                    const w = weeks.find(x => x.monday === selectedWeek)
                    const fmt = iso => new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })
                    return `${fmt(w.monday)} – ${fmt(w.sunday)} · ${selectedNotes.length} note${selectedNotes.length > 1 ? 's' : ''}`
                  })()}
                </div>
                <div className="jd-notes-list">
                  {selectedNotes.map(n => (
                    <NoteCard key={n.id} note={n} showDate
                      contextNoteIds={sortedIds(selectedNotes)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
