import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export default function UserEditor({ user, adminToken, onClose }) {
  const { t } = useTranslation()
  const isNew = !user.id
  const [form, setForm] = useState({
    username: user.username ?? '',
    email: user.email ?? '',
    password: '',
    is_active: user.is_active ?? true,
  })

  function handleChange(e) {
    const { name, value, type, checked } = e.target
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    const url = isNew ? '/api/admin/users' : `/api/admin/users/${user.id}`
    const method = isNew ? 'POST' : 'PUT'
    await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify(form),
    })
    onClose()
  }

  async function handleDelete() {
    if (!confirm('Supprimer cet utilisateur ?')) return
    await fetch(`/api/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    onClose()
  }

  return (
    <div className="modal-overlay">
      <form className="modal" onSubmit={handleSave}>
        <h2>{isNew ? t('admin.addUser') : user.username}</h2>
        <input name="username" placeholder={t('admin.username')} value={form.username} onChange={handleChange} required />
        <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleChange} required />
        <input name="password" type="password" placeholder={t('login.password')} value={form.password} onChange={handleChange} required={isNew} />
        <label>
          <input name="is_active" type="checkbox" checked={form.is_active} onChange={handleChange} />
          {t('admin.active')}
        </label>
        <div className="modal-actions">
          <button type="submit">{t('admin.save')}</button>
          {!isNew && <button type="button" onClick={handleDelete}>{t('admin.delete')}</button>}
          <button type="button" onClick={onClose}>{t('admin.cancel')}</button>
        </div>
      </form>
    </div>
  )
}
