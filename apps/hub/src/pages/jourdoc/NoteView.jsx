import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import RichTextView from './RichTextView'
import MediaCard from './MediaCard'
import Lightbox from './Lightbox'

const NATURE_ICON = { observation: '👁', activite: '⚡', documentation: '📄', journal: '📔' }
const NATURE_LABEL = { observation: 'Observation', activite: 'Activité', documentation: 'Documentation', journal: 'Journal' }

function fmtDateLong(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}
function fmtDateShort(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ChainChip({ note, onClick }) {
  const typeKey = note.nature ?? note.type ?? 'journal'
  return (
    <button className={`note-view__chain-chip note-view__chain-chip--${typeKey}`} onClick={onClick} title={note.titre}>
      <span className="note-view__chain-chip__icon">{NATURE_ICON[typeKey] ?? '📔'}</span>
      <span className="note-view__chain-chip__title">{note.titre}</span>
      {note.date && <em className="note-view__chain-chip__date">{fmtDateShort(note.date)}</em>}
    </button>
  )
}

export default function NoteView() {
  const { wsId, noteId } = useParams()
  const { token } = useAuth()
  const navigate = useNavigate()
  const [note, setNote] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lbIdx, setLbIdx] = useState(-1)

  useEffect(() => {
    setLoading(true)
    fetch(API_ROUTES.JD_NOTE(wsId, noteId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(d => setNote(d.note ?? null))
      .finally(() => setLoading(false))
  }, [wsId, noteId, token])

  if (loading) return <div className="jd-loading">Chargement…</div>
  if (!note) return (
    <div className="empty-state">
      <div className="empty-state__icon">🔍</div>
      <p>Note introuvable.</p>
    </div>
  )

  const typeKey = note.nature ?? note.type ?? 'journal'
  const photoMedias = (note.medias ?? []).filter(m => m.type_media !== 'pdf')
  const hasChain = (note.liens?.length ?? 0) > 0 || (note.liensEntrants?.length ?? 0) > 0

  return (
    <div className="note-view">
      {/* Barre d'actions */}
      <div className="note-view__bar">
        <button className="btn btn-ghost" style={{ padding: '.35rem .6rem', fontSize: '.875rem' }}
          onClick={() => navigate(-1)}>← Retour</button>
        <button className="btn btn-primary" style={{ padding: '.45rem 1rem', fontSize: '.875rem' }}
          onClick={() => navigate(`/jourdoc/${wsId}/notes/${noteId}/edit`)}>✏️ Modifier</button>
      </div>

      {/* Layout 2 colonnes desktop */}
      <div className="note-view__layout">

        {/* ── Colonne principale ── */}
        <div className="note-view__main">
          {/* En-tête */}
          <div className="note-view__head">
            <div className="note-view__head-meta">
              <span className={`jd-badge jd-badge-${typeKey}`}>
                {NATURE_ICON[typeKey]} {NATURE_LABEL[typeKey]}
              </span>
              {note.date && (
                <span className="note-view__date">{fmtDateLong(note.date)}</span>
              )}
            </div>
            <h1 className="note-view__title">{note.titre}</h1>
            {note.titre_alt && (
              <p className="note-view__title-alt">{note.titre_alt}</p>
            )}
          </div>

          {/* Contenu */}
          <div className="note-view__body">
            {note.contenu
              ? <RichTextView content={note.contenu} />
              : <p style={{ color: 'var(--text-subtle)', fontStyle: 'italic' }}>Aucun contenu rédigé.</p>
            }
          </div>

          {/* Médias */}
          {note.medias?.length > 0 && (
            <div className="note-view__section">
              <h3 className="note-view__section-title">📎 Pièces jointes</h3>
              <div className="media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '.5rem' }}>
                {note.medias.map(m => (
                  <MediaCard key={m.id} media={m} size="sm"
                    onExpand={m.type_media !== 'pdf'
                      ? () => setLbIdx(photoMedias.findIndex(pm => pm.id === m.id))
                      : null}
                    onNotes={() => navigate(`/jourdoc/${wsId}/media/${m.id}`)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="note-view__sidebar">
          {/* Objets liés */}
          {note.objets?.length > 0 && (
            <div className="note-view__sidebar-block">
              <h4 className="note-view__sidebar-title">🌿 Objets</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.375rem' }}>
                {note.objets.map(o => (
                  <span key={o.id} className="jd-chip"
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/jourdoc/${wsId}/objet/${o.id}`)}>
                    {o.nom}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Thème */}
          {note.theme_nom && (
            <div className="note-view__sidebar-block">
              <h4 className="note-view__sidebar-title">🏷️ Thème</h4>
              <span className="jd-chip">{note.theme_nom}</span>
            </div>
          )}

          {/* Source URL */}
          {note.source_url && (
            <div className="note-view__sidebar-block">
              <h4 className="note-view__sidebar-title">🔗 Source</h4>
              <a href={note.source_url} target="_blank" rel="noopener noreferrer"
                className="note-view__source"
                title={note.source_url}>
                {note.source_url.replace(/^https?:\/\//, '').slice(0, 50)}
              </a>
            </div>
          )}

          {/* Fil de notes */}
          {hasChain && (
            <div className="note-view__sidebar-block">
              <h4 className="note-view__sidebar-title">📎 Fil de notes</h4>

              {note.liens?.length > 0 && (
                <div className="note-view__chain-group">
                  <span className="note-view__chain-label">Contexte</span>
                  {note.liens.map(n => (
                    <ChainChip key={n.id} note={n}
                      onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)} />
                  ))}
                </div>
              )}

              {note.liensEntrants?.length > 0 && (
                <div className="note-view__chain-group">
                  <span className="note-view__chain-label">Suite</span>
                  {note.liensEntrants.map(n => (
                    <ChainChip key={n.id} note={n}
                      onClick={() => navigate(`/jourdoc/${wsId}/notes/${n.id}`)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Créée le */}
          <div className="note-view__sidebar-block note-view__meta-footer">
            <span>Créée le {new Date(note.created_at).toLocaleDateString('fr-CH')}</span>
            {note.updated_at !== note.created_at && (
              <span>Modifiée le {new Date(note.updated_at).toLocaleDateString('fr-CH')}</span>
            )}
          </div>
        </aside>
      </div>

      {/* Lightbox médias */}
      {lbIdx >= 0 && (
        <Lightbox
          media={photoMedias[lbIdx]}
          onClose={() => setLbIdx(-1)}
          onPrev={lbIdx > 0 ? () => setLbIdx(i => i - 1) : null}
          onNext={lbIdx < photoMedias.length - 1 ? () => setLbIdx(i => i + 1) : null}
        />
      )}
    </div>
  )
}
