import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { getSharedFiles, clearSharedFiles } from '../utils/shareDB'

const APPS = [
  { slug: 'jourdoc', label: 'JourDoc', icon: '📔', desc: 'Notes de terrain, médias, objets' },
]

function localISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

export default function ShareTarget() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const isShared = new URLSearchParams(window.location.search).get('shared') === '1'

  const [files, setFiles]           = useState([])
  const [previews, setPreviews]     = useState([])
  const [workspaces, setWorkspaces] = useState([])
  const [selectedApp, setSelectedApp] = useState('jourdoc')
  const [selectedWs, setSelectedWs] = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [error, setError]           = useState('')
  const urlsRef = useRef([])

  // Charger les fichiers depuis IDB + les workspaces
  useEffect(() => {
    if (!isShared || !token) return

    getSharedFiles().then(f => {
      setFiles(f)
      const urls = f.map(file => ({
        name: file.name,
        objectUrl: URL.createObjectURL(file),
        isImage: file.type.startsWith('image/') || /\.(heic|heif)$/i.test(file.name),
        isPdf: file.type === 'application/pdf',
      }))
      urlsRef.current = urls.map(u => u.objectUrl)
      setPreviews(urls)
    })

    fetch(API_ROUTES.JD_WORKSPACES(), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(d => {
        const ws = d.workspaces ?? []
        setWorkspaces(ws)
        if (ws.length === 1) setSelectedWs(ws[0].id)
      })

    return () => urlsRef.current.forEach(u => URL.revokeObjectURL(u))
  }, [isShared, token])

  async function doImport() {
    if (!selectedWs || files.length === 0) return
    setUploading(true); setError('')
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('files', f))
      fd.append('date_prise', localISO(new Date()))
      const res = await fetch(API_ROUTES.JD_MEDIAS(selectedWs), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      if (!res.ok) throw new Error(`Erreur serveur ${res.status}`)
      await clearSharedFiles()
      navigate(`/jourdoc/${selectedWs}/medias`)
    } catch (e) {
      setError(e.message)
    } finally {
      setUploading(false)
    }
  }

  async function cancel() {
    await clearSharedFiles()
    navigate('/')
  }

  // ── Pas authentifié ────────────────────────────────────
  if (!token) return (
    <div className="share-screen share-screen--center">
      <div className="share-screen__logo">
        <img src="/icon-192.png" alt="pogil" width="72" height="72" style={{ borderRadius: 16 }} />
      </div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
        Connectez-vous pour importer des fichiers dans JourDoc.
      </p>
      <button className="btn btn-primary" onClick={() => navigate('/login')}>
        Se connecter
      </button>
    </div>
  )

  // ── Pas de partage en cours ────────────────────────────
  if (!isShared) return (
    <div className="share-screen share-screen--center">
      <p style={{ color: 'var(--text-muted)' }}>Aucun fichier partagé.</p>
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginTop: '1rem' }}>
        Retour
      </button>
    </div>
  )

  // ── Picker ─────────────────────────────────────────────
  return (
    <div className="share-screen">
      <div className="share-screen__header">
        <img src="/icon-192.png" alt="pogil" width="40" height="40"
          style={{ borderRadius: 10, flexShrink: 0 }} />
        <div>
          <h2 className="share-screen__title">Importer dans pogil</h2>
          <p className="share-screen__subtitle">
            {files.length} fichier{files.length > 1 ? 's' : ''} à importer
          </p>
        </div>
      </div>

      {/* Préviews */}
      {previews.length > 0 && (
        <div className="share-previews">
          {previews.map((p, i) => (
            p.isImage
              ? <img key={i} src={p.objectUrl} alt={p.name} className="share-preview__thumb" />
              : <div key={i} className="share-preview__pdf">📄<span>{p.name.slice(0, 16)}</span></div>
          ))}
        </div>
      )}

      {/* Choix de l'application */}
      <div className="share-section">
        <h3 className="share-section__title">Application</h3>
        <div className="share-apps">
          {APPS.map(app => (
            <button key={app.slug}
              className={`share-app-btn${selectedApp === app.slug ? ' active' : ''}`}
              onClick={() => setSelectedApp(app.slug)}>
              <span className="share-app-btn__icon">{app.icon}</span>
              <div>
                <div className="share-app-btn__name">{app.label}</div>
                <div className="share-app-btn__desc">{app.desc}</div>
              </div>
              {selectedApp === app.slug && <span className="share-app-btn__check">✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Choix du workspace */}
      <div className="share-section">
        <h3 className="share-section__title">Workspace</h3>
        {workspaces.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: '.875rem' }}>Chargement…</p>
        ) : (
          <div className="share-ws-list">
            {workspaces.map(ws => (
              <button key={ws.id}
                className={`share-ws-btn${selectedWs === ws.id ? ' active' : ''}`}
                onClick={() => setSelectedWs(ws.id)}>
                <span className="share-ws-btn__name">{ws.name}</span>
                {selectedWs === ws.id && <span className="share-ws-btn__check">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '.875rem', padding: '0 1rem' }}>{error}</p>}

      {/* Actions */}
      <div className="share-screen__actions">
        <button className="btn btn-ghost" onClick={cancel}>Annuler</button>
        <button className="btn btn-primary"
          onClick={doImport}
          disabled={!selectedWs || uploading || files.length === 0}>
          {uploading
            ? 'Import en cours…'
            : `Importer ${files.length} fichier${files.length > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}
