import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { useJdData, authHeader } from './hooks'
import HierarchyPicker from './HierarchyPicker'

function today() {
  return new Date().toISOString().slice(0, 10)
}

export default function NoteForm() {
  const { wsId, noteId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const { objets, themes } = useJdData(wsId, token)
  const isEdit = Boolean(noteId)

  const [form, setForm] = useState({
    type: 'journal',
    nature: 'observation',
    theme_id: null,
    objet_ids: [],
    titre: '',
    titre_alt: '',
    contenu: '',
    date: today(),
    source_url: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isEdit) return
    fetch(API_ROUTES.JD_NOTE(wsId, noteId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(({ note }) => {
        setForm({
          type: note.type,
          nature: note.nature ?? 'observation',
          theme_id: note.theme_id,
          objet_ids: note.objets.map(o => o.id),
          titre: note.titre,
          titre_alt: note.titre_alt ?? '',
          contenu: note.contenu ?? '',
          date: note.date ?? today(),
          source_url: note.source_url ?? '',
        })
      })
  }, [isEdit, noteId, wsId, token])

  function autoTitle() {
    const selectedObjets = objets.filter(o => form.objet_ids.includes(o.id))
    const theme = themes.find(t => t.id === form.theme_id)
    const parts = []
    if (selectedObjets.length) parts.push(selectedObjets.map(o => o.nom).join(', '))
    if (theme) parts.push(theme.nom)
    const titre = parts.join(' → ')
    const titreAlt = [
      selectedObjets.map(o => o.nom_court || o.nom.slice(0,3)).join('/'),
      theme ? (theme.nom_court || theme.nom.slice(0,4)) : '',
    ].filter(Boolean).join(' → ')
    setForm(f => ({ ...f, titre, titre_alt: titreAlt }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const body = {
        ...form,
        nature: form.type === 'journal' ? form.nature : null,
        source_url: form.source_url || null,
        titre_alt: form.titre_alt || null,
      }
      const url = isEdit ? API_ROUTES.JD_NOTE(wsId, noteId) : API_ROUTES.JD_NOTES(wsId)
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: authHeader(token),
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error()
      navigate(`/jourdoc/${wsId}`)
    } catch {
      setError('Erreur lors de la sauvegarde.')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Supprimer cette note ?')) return
    await fetch(API_ROUTES.JD_NOTE(wsId, noteId), {
      method: 'DELETE', headers: authHeader(token)
    })
    navigate(`/jourdoc/${wsId}`)
  }

  return (
    <div className="jd-note-form">
      <div className="jd-form-header">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }} onClick={() => navigate(-1)}>
          ← Retour
        </button>
        <h2>{isEdit ? 'Modifier la note' : 'Nouvelle note'}</h2>
      </div>

      <form onSubmit={handleSubmit} className="jd-form">
        {error && <p className="msg msg-error">{error}</p>}

        {/* Type + Nature */}
        <div className="jd-form-row">
          <div className="form-field">
            <label className="form-label">Type</label>
            <div className="jd-segmented">
              {['journal', 'documentation'].map(t => (
                <button key={t} type="button"
                  className={`jd-seg-btn${form.type === t ? ' active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, type: t }))}>
                  {t === 'journal' ? '📔 Journal' : '📄 Documentation'}
                </button>
              ))}
            </div>
          </div>

          {form.type === 'journal' && (
            <div className="form-field">
              <label className="form-label">Nature</label>
              <div className="jd-segmented">
                {[['observation', '👁 Observation'], ['activite', '⚡ Activité']].map(([v, l]) => (
                  <button key={v} type="button"
                    className={`jd-seg-btn${form.nature === v ? ' active' : ''}`}
                    onClick={() => setForm(f => ({ ...f, nature: v }))}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date (journal only) */}
        {form.type === 'journal' && (
          <div className="form-field jd-date-field">
            <label className="form-label">Date</label>
            <div className="jd-date-row">
              <button type="button" className="jd-date-arrow" onClick={() => {
                const d = new Date(form.date); d.setDate(d.getDate() - 1)
                setForm(f => ({ ...f, date: d.toISOString().slice(0,10) }))
              }}>‹</button>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                style={{ textAlign: 'center', flex: 1 }} />
              <button type="button" className="jd-date-arrow" onClick={() => {
                const d = new Date(form.date); d.setDate(d.getDate() + 1)
                setForm(f => ({ ...f, date: d.toISOString().slice(0,10) }))
              }}>›</button>
            </div>
          </div>
        )}

        {/* Thème */}
        <HierarchyPicker
          items={themes}
          value={form.theme_id}
          onChange={v => setForm(f => ({ ...f, theme_id: v }))}
          mode="single"
          label="Thème"
          placeholder="Choisir un thème…"
        />

        {/* Objets */}
        <HierarchyPicker
          items={objets}
          value={form.objet_ids}
          onChange={v => setForm(f => ({ ...f, objet_ids: v }))}
          mode="multi"
          label="Objets liés"
          placeholder="Choisir un ou plusieurs objets…"
        />

        {/* Titre */}
        <div className="form-field">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="form-label">Titre *</label>
            <button type="button" className="jd-auto-btn" onClick={autoTitle}>
              ✨ Générer
            </button>
          </div>
          <input className="input" value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} required placeholder="Titre de la note" />
        </div>

        {/* Titre alternatif (compact) */}
        <div className="form-field">
          <label className="form-label">Titre alternatif <span style={{ color: 'var(--text-subtle)', fontWeight: 400 }}>(calendrier compact)</span></label>
          <input className="input" value={form.titre_alt} onChange={e => setForm(f => ({ ...f, titre_alt: e.target.value }))} placeholder="Ex : Pom/Gol → TrAntif" />
        </div>

        {/* Contenu */}
        <div className="form-field">
          <label className="form-label">Contenu</label>
          <textarea className="input jd-textarea" value={form.contenu}
            onChange={e => setForm(f => ({ ...f, contenu: e.target.value }))}
            placeholder="Détails de la note…" rows={5} />
        </div>

        {/* Source URL (documentation) */}
        {form.type === 'documentation' && (
          <div className="form-field">
            <label className="form-label">Source URL</label>
            <input className="input" type="url" value={form.source_url}
              onChange={e => setForm(f => ({ ...f, source_url: e.target.value }))}
              placeholder="https://…" />
          </div>
        )}

        <div className="form-actions" style={{ marginTop: '.5rem' }}>
          {isEdit && (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Supprimer</button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>Annuler</button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? '…' : isEdit ? 'Enregistrer' : 'Créer la note'}
          </button>
        </div>
      </form>
    </div>
  )
}
