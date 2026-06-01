import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import UserEditor from './UserEditor'
import AdminSettings from './AdminSettings'
import TopBar from '../../components/TopBar'
import Footer from '../../components/Footer'

export default function AdminDashboard() {
  const { t } = useTranslation()
  const { adminToken, adminLogout } = useAuth()
  const [users, setUsers] = useState([])
  const [editingUser, setEditingUser] = useState(null)

  async function fetchUsers() {
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    const data = await res.json()
    setUsers(data.users ?? [])
  }

  useEffect(() => { fetchUsers() }, [])

  return (
    <div className="app-layout">
      <TopBar isAdmin onLogout={adminLogout} />
      <main className="main-content">

        {/* Users section */}
        <section className="admin-section">
          <div className="admin-section__hd">
            <h2 className="admin-section__title">
              👥 {t('admin.users')}
            </h2>
            <button className="btn btn-primary" style={{ padding: '.45rem .9rem', fontSize: '.8125rem' }} onClick={() => setEditingUser({})}>
              + {t('admin.addUser')}
            </button>
          </div>

          {/* Desktop table */}
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th>{t('admin.username')}</th>
                  <th>Email</th>
                  <th>{t('admin.active')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 600 }}>{u.username}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <span className={`badge ${u.is_active ? 'badge-success' : 'badge-danger'}`}>
                        {u.is_active ? t('admin.active') : t('admin.inactive')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-secondary" style={{ padding: '.35rem .75rem', fontSize: '.8125rem' }} onClick={() => setEditingUser(u)}>
                        {t('admin.edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="users-cards">
            {users.map((u) => (
              <div key={u.id} className="user-card">
                <div className="user-card__info">
                  <span className="user-card__name">{u.username}</span>
                  <span className="user-card__email">{u.email}</span>
                </div>
                <button className="btn btn-secondary" style={{ padding: '.35rem .75rem', fontSize: '.8125rem' }} onClick={() => setEditingUser(u)}>
                  {t('admin.edit')}
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Settings section */}
        <section className="admin-section">
          <div className="admin-section__hd">
            <h2 className="admin-section__title">⚙️ {t('admin.settings.title')}</h2>
          </div>
          <AdminSettings />
        </section>

      </main>

      {editingUser !== null && (
        <UserEditor
          user={editingUser}
          adminToken={adminToken}
          onClose={() => { setEditingUser(null); fetchUsers() }}
        />
      )}

      <Footer />
    </div>
  )
}
