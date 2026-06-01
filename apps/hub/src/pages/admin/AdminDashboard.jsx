import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import UserEditor from './UserEditor'

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
    <div className="admin-dashboard">
      <header>
        <h1>{t('admin.title')}</h1>
        <button onClick={adminLogout}>{t('portal.logout')}</button>
      </header>
      <section>
        <div className="section-header">
          <h2>{t('admin.users')}</h2>
          <button onClick={() => setEditingUser({})}>{t('admin.addUser')}</button>
        </div>
        <table>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.is_active ? t('admin.active') : t('admin.inactive')}</td>
                <td>
                  <button onClick={() => setEditingUser(u)}>Edit</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {editingUser !== null && (
        <UserEditor
          user={editingUser}
          adminToken={adminToken}
          onClose={() => { setEditingUser(null); fetchUsers() }}
        />
      )}
    </div>
  )
}
