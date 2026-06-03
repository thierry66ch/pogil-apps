import { useNavigate, useParams } from 'react-router-dom'

const NATURE_ICON = { observation: '👁', activite: '⚡' }
const TYPE_ICON   = { journal: '📔', documentation: '📄' }

export default function NoteCard({ note }) {
  const { wsId } = useParams()
  const navigate = useNavigate()

  return (
    <div className="jd-note-card" onClick={() => navigate(`/jourdoc/${wsId}/notes/${note.id}`)}>
      <div className="jd-note-card__top">
        <span className={`jd-badge jd-badge-${note.nature ?? note.type}`}>
          {note.nature ? NATURE_ICON[note.nature] : TYPE_ICON[note.type]}
          {note.nature ?? note.type}
        </span>
        {note.theme_nom && <span className="jd-note-card__theme">{note.theme_nom}</span>}
      </div>

      <p className="jd-note-card__titre">{note.titre}</p>

      {note.objets?.length > 0 && (
        <div className="jd-note-card__objets">
          {note.objets.map(o => (
            <span key={o.id} className="jd-chip" onClick={e => {
              e.stopPropagation()
              navigate(`/jourdoc/${wsId}/objet/${o.id}`)
            }}>{o.nom}</span>
          ))}
        </div>
      )}

      {/* Vignettes médias */}
      {note.medias?.length > 0 && (
        <div className="jd-note-card__medias">
          {note.medias.slice(0, 5).map(m => (
            m.type_media === 'pdf'
              ? <div key={m.id} className="jd-thumb jd-thumb--pdf" title={m.nom_original}>📄</div>
              : <img key={m.id} className="jd-thumb" src={`/${m.fichier}`}
                  alt="" loading="lazy" title={m.nom_original} />
          ))}
          {note.medias.length > 5 && (
            <div className="jd-thumb jd-thumb--more">+{note.medias.length - 5}</div>
          )}
        </div>
      )}
    </div>
  )
}
