import { useEffect } from 'react'

export default function Lightbox({ media, onClose, onPrev, onNext }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape')      onClose()
      if (e.key === 'ArrowLeft')   onPrev?.()
      if (e.key === 'ArrowRight')  onNext?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onPrev, onNext])

  if (!media) return null

  return (
    <div className="lightbox" onClick={onClose}>
      {/* Précédent */}
      {onPrev && (
        <button className="lightbox__nav lightbox__nav--prev"
          onClick={e => { e.stopPropagation(); onPrev() }}>‹</button>
      )}

      {/* Contenu */}
      <div className="lightbox__content" onClick={e => e.stopPropagation()}>
        {media.type_media === 'pdf' ? (
          <div className="lightbox__pdf">
            <span style={{ fontSize: '4rem' }}>📄</span>
            <p>{media.nom_original}</p>
          </div>
        ) : (
          <img src={`/${media.fichier}`} alt={media.nom_original} className="lightbox__img" />
        )}
        <div className="lightbox__caption">
          <span>{media.nom_original}</span>
          {media.date_prise && <span>{media.date_prise}</span>}
        </div>
      </div>

      {/* Suivant */}
      {onNext && (
        <button className="lightbox__nav lightbox__nav--next"
          onClick={e => { e.stopPropagation(); onNext() }}>›</button>
      )}

      {/* Fermer */}
      <button className="lightbox__close" onClick={onClose}>×</button>
    </div>
  )
}
