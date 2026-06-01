import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'
import AppCard from '../components/AppCard'

export default function Portal() {
  const { t } = useTranslation()
  const { token, logout } = useAuth()
  const [apps, setApps] = useState([])
  const [user, setUser] = useState(null)

  useEffect(() => {
    fetch(API_ROUTES.ME_APPS, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        setApps(data.apps ?? [])
        setUser(data.user ?? null)
      })
  }, [token])

  return (
    <div className="portal">
      <header className="portal-header">
        <span>{user?.username}</span>
        <button onClick={logout}>{t('portal.logout')}</button>
      </header>
      <main className="portal-grid">
        <h1>{t('portal.title')}</h1>
        {apps.length === 0 ? (
          <p>{t('portal.noApps')}</p>
        ) : (
          <div className="app-grid">
            {apps.map((app) => (
              <AppCard key={app.slug} app={app} token={token} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
