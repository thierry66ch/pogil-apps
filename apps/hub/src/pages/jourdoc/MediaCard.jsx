const PDF_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 32, height: 32 }}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="9" y1="15" x2="15" y2="15"/>
    <line x1="9" y1="11" x2="15" y2="11"/>
  </svg>
)

/**
 * Vignette d'un média dans la galerie.
 * selected / onSelect / onDelete optionnels.
 */
export default function MediaCard({ media, selected, onSelect, onDelete, size = 'md' }) {
  const isPhoto = media.type_media !== 'pdf'
  const url = `/${media.fichier}`
  const sz = size === 'sm' ? 'media-card--sm' : size === 'lg' ? 'media-card--lg' : ''

  return (
    <div
      className={`media-card ${sz}${selected ? ' media-card--selected' : ''}`}
      onClick={onSelect}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e => (e.key === 'Enter' || e.key === ' ') && onSelect()) : undefined}
    >
      {isPhoto ? (
        <img src={url} alt={media.nom_original} className="media-card__img" loading="lazy" />
      ) : (
        <div className="media-card__pdf">
          {PDF_ICON}
          <span className="media-card__pdf-name">{(media.nom_original ?? '').replace(/\.pdf$/i, '')}</span>
        </div>
      )}

      {/* Overlay sélection */}
      {selected && <div className="media-card__check">✓</div>}

      {/* Badge lié */}
      {media.lie ? <span className="media-card__badge media-card__badge--lie">✓ lié</span> : null}

      {/* Supprimer */}
      {onDelete && (
        <button
          className="media-card__del"
          onClick={e => { e.stopPropagation(); onDelete() }}
          title="Supprimer"
        >×</button>
      )}
    </div>
  )
}
