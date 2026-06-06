import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './styles/global.css'
import './i18n'
import Login from './pages/Login'
import Portal from './pages/Portal'
import AdminLogin from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'
import JourDocApp from './pages/jourdoc/JourDocApp'
import JourDocJournal from './pages/jourdoc/JourDocJournal'
import NoteForm from './pages/jourdoc/NoteForm'
import ObjetDetail from './pages/jourdoc/ObjetDetail'
import ThemeDetail from './pages/jourdoc/ThemeDetail'
import ObjetManager from './pages/jourdoc/ObjetManager'
import ThemeManager from './pages/jourdoc/ThemeManager'
import MediaGallery from './pages/jourdoc/MediaGallery'
import MediaDetail from './pages/jourdoc/MediaDetail'
import CalendarView from './pages/jourdoc/CalendarView'
import NoteView from './pages/jourdoc/NoteView'
import WorkspaceManager from './pages/jourdoc/WorkspaceManager'
import ShareTarget from './pages/ShareTarget'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { getSharedFiles } from './utils/shareDB'

// Détecte une session de partage TWA — cookie ET polling serveur.
// La TWA navigue vers start_url (/) sans suivre le redirect 303 du POST ;
// le polling toutes les 500ms pendant 10s attrape la session dès qu'elle est créée.
function ShareIntentDetector() {
  const navigate = useNavigate()
  useEffect(() => {
    let stopped = false
    let poll = null
    let stopPoll = null

    async function detect() {
      if (stopped) return
      if (window.location.pathname.startsWith('/share-target')) return
      // 1. Cookie (immédiat, sans réseau)
      const m = document.cookie.match(/(?:^|;\s*)share_session=([^;]+)/)
      if (m) { navigate(`/share-target?session=${m[1]}`, { replace: true }); return }
      // 2. Polling serveur (rattrape la course entre ouverture app et POST)
      try {
        const r = await fetch('/api/share-pending', { cache: 'no-store' })
        if (r.ok) {
          const { session } = await r.json()
          if (session) { navigate(`/share-target?session=${session}`, { replace: true }); return }
        }
      } catch { /* réseau indisponible */ }
      // 3. IDB — SW a intercepté le POST mais le redirect n'a pas causé de navigation
      try {
        const files = await getSharedFiles()
        if (files?.length) navigate('/share-target?shared=1', { replace: true })
      } catch { /* IDB indisponible */ }
    }

    function startPolling() {
      clearInterval(poll); clearTimeout(stopPoll)
      detect()
      poll = setInterval(detect, 500)
      stopPoll = setTimeout(() => clearInterval(poll), 10000)
    }

    startPolling()
    document.addEventListener('visibilitychange', startPolling)
    return () => {
      stopped = true
      clearInterval(poll); clearTimeout(stopPoll)
      document.removeEventListener('visibilitychange', startPolling)
    }
  }, [navigate])
  return null
}

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function AdminRoute({ children }) {
  const { adminToken } = useAuth()
  return adminToken ? children : <Navigate to="/admin/login" replace />
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ShareIntentDetector />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/share-target" element={<ShareTarget />} />
            <Route path="/" element={<PrivateRoute><Portal /></PrivateRoute>} />
            <Route path="/jourdoc/:wsId" element={<PrivateRoute><JourDocApp /></PrivateRoute>}>
              <Route index element={<JourDocJournal />} />
              <Route path="new" element={<NoteForm />} />
              <Route path="notes/:noteId" element={<NoteView />} />
              <Route path="notes/:noteId/edit" element={<NoteForm />} />
              <Route path="objet/:objetId" element={<ObjetDetail />} />
              <Route path="theme/:themeId" element={<ThemeDetail />} />
              <Route path="calendar" element={<CalendarView />} />
              <Route path="settings" element={<WorkspaceManager />} />
              <Route path="medias" element={<MediaGallery />} />
              <Route path="media/:mediaId" element={<MediaDetail />} />
              <Route path="objets" element={<ObjetManager />} />
              <Route path="themes" element={<ThemeManager />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
)
