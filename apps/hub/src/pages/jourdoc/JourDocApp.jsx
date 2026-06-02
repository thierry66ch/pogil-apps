import { useEffect, useState } from 'react'
import { Outlet, useParams, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import { authHeader } from './hooks'
import TopBar from '../../components/TopBar'
import Footer from '../../components/Footer'

const NAV = [
  { path: '',        icon: '📔', label: 'Journal' },
  { path: 'objets',  icon: '🌿', label: 'Objets' },
  { path: 'themes',  icon: '🏷️', label: 'Thèmes' },
]

export default function JourDocApp() {
  const { wsId } = useParams()
  const { token, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [ws, setWs] = useState(null)

  useEffect(() => {
    fetch(API_ROUTES.JD_WS(wsId), { headers: authHeader(token) })
      .then(r => r.json())
      .then(data => setWs(data.workspace))
  }, [wsId, token])

  function isActive(path) {
    const base = `/jourdoc/${wsId}`
    if (path === '') return location.pathname === base || location.pathname === base + '/'
    return location.pathname.includes(`${base}/${path}`)
  }

  return (
    <div className="app-layout jd-app">
      <TopBar
        user={ws ? { username: ws.name } : null}
        onLogout={logout}
      />

      <div className="jd-layout">
        {/* Sidebar desktop / nav bas mobile */}
        <nav className="jd-nav">
          {NAV.map(({ path, icon, label }) => (
            <button
              key={path}
              className={`jd-nav-item${isActive(path) ? ' active' : ''}`}
              onClick={() => navigate(`/jourdoc/${wsId}${path ? '/' + path : ''}`)}
            >
              <span className="jd-nav-icon">{icon}</span>
              <span className="jd-nav-label">{label}</span>
            </button>
          ))}
          <button
            className="jd-nav-item jd-nav-new"
            onClick={() => navigate(`/jourdoc/${wsId}/new`)}
          >
            <span className="jd-nav-icon">✚</span>
            <span className="jd-nav-label">Nouvelle note</span>
          </button>
        </nav>

        {/* Contenu principal */}
        <main className="jd-main">
          <Outlet />
        </main>
      </div>

      <Footer />
    </div>
  )
}
