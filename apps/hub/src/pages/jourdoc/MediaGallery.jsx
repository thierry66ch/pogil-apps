import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import MediaCard from './MediaCard'

function today() { return new Date().toISOString().slice(0, 10) }

function groupByDate(medias) {
  const groups = new Map()
  for (const m of medias) {
    const k = m.date_prise ?? 'Sans date'
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(m)
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]))
}

function fmtDate(iso) {
  if (!iso || iso === 'Sans date') return 'Sans date'
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

export default function MediaGallery() {
  const { wsId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [medias, setMedias] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selected, setSelected] = useState(new Set())

  // Filtres
  const [filterDate, setFilterDate] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterLie, setFilterLie] = useState('')

  async function loadMedias() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filterDate) { params.set('date_from', filterDate); params.set('date_to', filterDate) }
    if (filterType)  params.set('type_media', filterType)
    if (filterLie)   params.set('lie', filterLie)
    const url = `${API_ROUTES.JD_MEDIAS(wsId)}${params.toString() ? '?' + params : ''}`
    const data = await fetch(url, { headers: authHeader(token) }).then(r => r.json())
    setMedias(data.medias ?? [])
    setLoading(false)
  }

  useEffect(() => { loadMedias() }, [wsId, token, filterDate, filterType, filterLie])

  async function uploadFiles(files) {
    if (!files.length) return
    setUploading(true)
    const fd = new FormData()
    for (const f of files) fd.append('files', f)
    fd.append('date_prise', today())
    await fetch(API_ROUTES.JD_MEDIAS(wsId), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    await loadMedias()
    setUploading(false)
  }

  async function deleteMedia(id) {
    if (!confirm('Supprimer ce média ?')) return
    await fetch(API_ROUTES.JD_MEDIA(wsId, id), { method: 'DELETE', headers: authHeader(token) })
    setSelected(s => { const n = new Set(s); n.delete(id); return n })
    await loadMedias()
  }

  function toggleSelect(id) {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  function clearSelection() { setSelected(new Set()) }

  function createNote() {
    navigate(`/jourdoc/${wsId}/new`, { state: { media_ids: [...selected] } })
  }

  // Drag & drop
  function onDragOver(e) { e.preventDefault(); setDragging(true) }
  function onDragLeave() { setDragging(false) }
  function onDrop(e) {
    e.preventDefault(); setDragging(false)
    uploadFiles([...e.dataTransfer.files])
  }

  const groups = useMemo(() => groupByDate(medias), [medias])

  return (
    <div className="media-gallery">
      {/* Filtres */}
      <div className="media-gallery__filters">
        <input type="date" className="input" style={{ width: 'auto', padding: '.35rem .6rem', fontSize: '.875rem' }}
          value={filterDate} onChange={e => setFilterDate(e.target.value)}
          title="Filtrer par date" />
        <button type="button" onClick={() => setFilterDate(today())}
          className={`btn btn-ghost ${filterDate === today() ? 'btn-active' : ''}`}
          style={{ padding: '.35rem .75rem', fontSize: '.8rem' }}>Aujourd'hui</button>
        <button type="button" onClick={() => setFilterDate('')}
          className="btn btn-ghost" style={{ padding: '.35rem .75rem', fontSize: '.8rem' }}>Tous</button>

        <select className="input" style={{ width: 'auto', padding: '.35rem .6rem', fontSize: '.875rem' }}
          value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">Tous types</option>
          <option value="photo">Photos</option>
          <option value="pdf">PDF</option>
        </select>

        <select className="input" style={{ width: 'auto', padding: '.35rem .6rem', fontSize: '.875rem' }}
          value={filterLie} onChange={e => setFilterLie(e.target.value)}>
          <option value="">Tous</option>
          <option value="0">Non liés</option>
          <option value="1">Liés à une note</option>
        </select>
      </div>

      {/* Zone d'upload */}
      <div
        className={`media-upload-zone${dragging ? ' dragging' : ''}`}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" multiple accept="image/*,application/pdf" style={{ display: 'none' }}
          onChange={e => uploadFiles([...e.target.files])} />
        {uploading ? (
          <span className="media-upload-zone__label">Envoi en cours…</span>
        ) : (
          <>
            <span className="media-upload-zone__icon">📤</span>
            <span className="media-upload-zone__label">
              Déposer des fichiers ici ou <strong>cliquer pour choisir</strong>
            </span>
            <span className="media-upload-zone__hint">Images (JPG, PNG, WEBP, HEIC) et PDF</span>
          </>
        )}
      </div>

      {/* Galerie */}
      {loading ? (
        <div className="jd-loading">Chargement…</div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state__icon">🖼️</div>
          <p>Aucun média{filterDate ? ' ce jour' : ''}.</p>
        </div>
      ) : (
        groups.map(([date, items]) => (
          <div key={date} className="media-group">
            <h3 className="media-group__title">
              {fmtDate(date)}
              <span className="media-group__count">{items.length}</span>
            </h3>
            <div className="media-grid">
              {items.map(m => (
                <MediaCard
                  key={m.id}
                  media={m}
                  selected={selected.has(m.id)}
                  onSelect={() => toggleSelect(m.id)}
                  onDelete={() => deleteMedia(m.id)}
                />
              ))}
            </div>
          </div>
        ))
      )}

      {/* Barre d'actions (sélection active) */}
      {selected.size > 0 && (
        <div className="media-action-bar">
          <span className="media-action-bar__count">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          <button className="btn btn-primary" onClick={createNote}>
            + Créer une note
          </button>
          <button className="btn btn-danger" onClick={async () => {
            if (!confirm(`Supprimer ${selected.size} média(s) ?`)) return
            for (const id of selected) await deleteMedia(id)
            clearSelection()
          }}>🗑</button>
          <button className="btn btn-ghost" onClick={clearSelection}>Annuler</button>
        </div>
      )}
    </div>
  )
}
