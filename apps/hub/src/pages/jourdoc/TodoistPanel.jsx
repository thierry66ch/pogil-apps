import { useState, useEffect } from 'react'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'

const PRIORITY_OPTIONS = [
  { value: 4, label: 'P1 — Urgente', color: '#db4035' },
  { value: 3, label: 'P2 — Haute',   color: '#ff9933' },
  { value: 2, label: 'P3 — Normale', color: '#4073ff' },
  { value: 1, label: 'P4 — Basse',   color: '#aaa' },
]

const RECURRENCE_HELP = [
  ['every day',       'Chaque jour'],
  ['every weekday',   'Chaque jour ouvrable'],
  ['every week',      'Chaque semaine'],
  ['every monday',    'Chaque lundi'],
  ['every 2 weeks',   'Toutes les 2 semaines'],
  ['every month',     'Chaque mois'],
  ['every 3 months',  'Tous les 3 mois'],
]

export default function TodoistPanel({ wsId, token, note }) {
  const [status, setStatus]     = useState(null)   // null = chargement, objet = résultat polling
  const [creating, setCreating] = useState(false)
  const [form, setForm]         = useState({ due_date: '', priority: 2, recurrence: '' })
  const [saving, setSaving]     = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [err, setErr]           = useState('')

  // Polling au montage si la note a déjà un task_id
  useEffect(() => {
    if (!note?.tache_todoist_id) { setStatus({ linked: false }); return }
    fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), { headers: authHeader(token) })
      .then(r => r.json())
      .then(setStatus)
      .catch(() => setStatus({ linked: true, error: 'Erreur réseau' }))
  }, [note?.id, note?.tache_todoist_id, wsId, token])

  async function createTask(e) {
    e.preventDefault()
    setSaving(true); setErr('')
    try {
      const res = await fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), {
        method: 'POST',
        headers: authHeader(token),
        body: JSON.stringify({
          due_date:   form.due_date   || undefined,
          priority:   form.priority,
          recurrence: form.recurrence || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error ?? 'Erreur'); return }
      setStatus({ linked: true, completed: false, url: data.url, task_id: data.task_id, content: note.titre })
      setCreating(false)
    } catch { setErr('Erreur réseau') }
    finally { setSaving(false) }
  }

  async function unlink(deleteInTodoist) {
    if (!confirm(deleteInTodoist ? 'Supprimer aussi la tâche dans Todoist ?' : 'Délier la tâche ?')) return
    await fetch(API_ROUTES.JD_NOTE_TODOIST(wsId, note.id), {
      method: 'DELETE',
      headers: authHeader(token),
      body: JSON.stringify({ delete_in_todoist: deleteInTodoist }),
    })
    setStatus({ linked: false })
  }

  // Chargement initial
  if (status === null) return (
    <div className="todoist-panel todoist-panel--loading">
      <span className="todoist-logo">✓</span> <span style={{ color: 'var(--text-muted)', fontSize: '.8rem' }}>Chargement…</span>
    </div>
  )

  // Tâche liée — affichage statut
  if (status.linked) {
    const priorityColor = status.completed ? '#aaa' : '#e44332'
    return (
      <div className="todoist-panel">
        <div className="todoist-panel__header">
          <span className="todoist-logo">✓</span>
          <span className="todoist-panel__title">Tâche Todoist</span>
          {status.completed
            ? <span className="todoist-badge todoist-badge--done">Terminée</span>
            : <span className="todoist-badge todoist-badge--open">En cours</span>
          }
        </div>

        {status.error ? (
          <p style={{ color: 'var(--danger)', fontSize: '.8rem' }}>{status.error}</p>
        ) : (
          <>
            <p className="todoist-task-content">{status.content ?? note.titre}</p>
            {status.due && (
              <p className="todoist-task-due">
                📅 {status.due.date ?? status.due.string}
                {status.due.is_recurring && ' 🔁'}
              </p>
            )}
            {status.url && (
              <a href={status.url} target="_blank" rel="noopener noreferrer"
                className="todoist-link">
                Ouvrir dans Todoist ↗
              </a>
            )}
          </>
        )}

        <div className="todoist-panel__actions">
          <button className="btn btn-ghost" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
            onClick={() => unlink(false)}>Délier</button>
          <button className="btn btn-danger" style={{ fontSize: '.75rem', padding: '.25rem .5rem' }}
            onClick={() => unlink(true)}>Supprimer dans Todoist</button>
        </div>
      </div>
    )
  }

  // Pas de tâche — formulaire création
  return (
    <div className="todoist-panel">
      <div className="todoist-panel__header">
        <span className="todoist-logo">✓</span>
        <span className="todoist-panel__title">Todoist</span>
      </div>

      {!creating ? (
        <button className="btn btn-secondary" style={{ fontSize: '.8125rem', width: '100%' }}
          onClick={() => setCreating(true)}>
          + Créer une tâche
        </button>
      ) : (
        <form onSubmit={createTask} className="todoist-form">
          {err && <p style={{ color: 'var(--danger)', fontSize: '.8rem', margin: '0 0 .5rem' }}>{err}</p>}

          <div className="todoist-form__row">
            <label className="todoist-form__label">Échéance</label>
            <input type="date" className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>

          <div className="todoist-form__row">
            <label className="todoist-form__label">Priorité</label>
            <div className="todoist-priority-group">
              {PRIORITY_OPTIONS.map(p => (
                <button key={p.value} type="button"
                  className={`todoist-prio-btn${form.priority === p.value ? ' active' : ''}`}
                  style={{ '--prio-color': p.color }}
                  onClick={() => setForm(f => ({ ...f, priority: p.value }))}>
                  {p.label.split(' — ')[0]}
                </button>
              ))}
            </div>
          </div>

          <div className="todoist-form__row">
            <div style={{ display: 'flex', alignItems: 'center', gap: '.375rem' }}>
              <label className="todoist-form__label">Récurrence</label>
              <button type="button" className="todoist-help-btn"
                onClick={() => setShowHelp(h => !h)} title="Aide syntaxe">?</button>
            </div>
            <input className="input" style={{ padding: '.3rem .5rem', fontSize: '.85rem' }}
              placeholder="ex : every monday, every 2 weeks…"
              value={form.recurrence}
              onChange={e => setForm(f => ({ ...f, recurrence: e.target.value }))} />
            {showHelp && (
              <div className="todoist-help-popup">
                <p style={{ fontWeight: 600, marginBottom: '.375rem', fontSize: '.8rem' }}>Syntaxe Todoist (anglais)</p>
                {RECURRENCE_HELP.map(([en, fr]) => (
                  <div key={en} className="todoist-help-row">
                    <code className="todoist-help-code"
                      onClick={() => { setForm(f => ({ ...f, recurrence: en })); setShowHelp(false) }}>
                      {en}
                    </code>
                    <span>{fr}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '.5rem', marginTop: '.25rem' }}>
            <button type="submit" className="btn btn-primary"
              style={{ fontSize: '.8125rem', flex: 1 }} disabled={saving}>
              {saving ? '…' : 'Créer la tâche'}
            </button>
            <button type="button" className="btn btn-ghost"
              style={{ fontSize: '.8125rem' }} onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
