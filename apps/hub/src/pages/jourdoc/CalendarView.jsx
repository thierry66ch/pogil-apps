import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader, useJdData } from './hooks'
import { getRange, shiftAnchor, rangeLabel, todayISO } from './calUtils'
import CalendarMonth from './CalendarMonth'
import CalendarWeek from './CalendarWeek'
import ObjectMatrix from './ObjectMatrix'

const MODES = [
  { key: 'month',  label: '📅 Mois',    period: 'month'  },
  { key: 'week',   label: '📆 Semaine', period: 'week'   },
  { key: 'matrix', label: '📊 Matrice', period: 'month'  },
]

export default function CalendarView() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const { objets } = useJdData(wsId, token)

  const [mode, setMode] = useState('month')
  const [anchor, setAnchor] = useState(todayISO())
  const [notes, setNotes] = useState([])
  const [loading, setLoading] = useState(true)

  const currentMode = MODES.find(m => m.key === mode)
  const { from, to } = useMemo(() => getRange(anchor, currentMode.period), [anchor, currentMode])

  // Date de référence pour CalendarMonth / ObjectMatrix
  const refDate = new Date(anchor + 'T00:00:00')
  const year  = refDate.getFullYear()
  const month = refDate.getMonth()

  useEffect(() => {
    setLoading(true)
    fetch(`${API_ROUTES.JD_NOTES(wsId)}?date_from=${from}&date_to=${to}`, { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNotes(d.notes ?? []))
      .finally(() => setLoading(false))
  }, [wsId, token, from, to])

  const period = currentMode.period

  return (
    <div className="cal-view">
      {/* Navigation période + sélecteur de mode */}
      <div className="cal-view__toolbar">
        <div className="period-nav">
          <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, -1))}>‹</button>
          <span className="period-nav__label">{rangeLabel(anchor, period)}</span>
          <button className="period-nav__arrow" onClick={() => setAnchor(a => shiftAnchor(a, period, 1))}>›</button>
          <button className="btn btn-ghost" style={{ padding: '.3rem .6rem', fontSize: '.8rem' }}
            onClick={() => setAnchor(todayISO())}>Aujourd'hui</button>
        </div>

        <div className="cal-mode-tabs">
          {MODES.map(m => (
            <button key={m.key}
              className={`cal-mode-tab${mode === m.key ? ' active' : ''}`}
              onClick={() => setMode(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Compteur rapide */}
      {!loading && notes.length > 0 && (
        <div className="cal-view__summary">
          <span>{notes.length} note{notes.length > 1 ? 's' : ''} sur la période</span>
          <span>·</span>
          <span>{notes.filter(n => n.nature === 'observation').length} observations</span>
          <span>·</span>
          <span>{notes.filter(n => n.nature === 'activite').length} activités</span>
          {notes.some(n => n.medias?.length) && (
            <><span>·</span><span>{notes.reduce((s, n) => s + (n.medias?.length ?? 0), 0)} médias</span></>
          )}
        </div>
      )}

      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : (
        <>
          {mode === 'month'  && <CalendarMonth notes={notes} year={year} month={month} />}
          {mode === 'week'   && <CalendarWeek  notes={notes} anchor={anchor} />}
          {mode === 'matrix' && <ObjectMatrix  notes={notes} objets={objets} year={year} month={month} />}
        </>
      )}
    </div>
  )
}
