import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'

export default function AdminSettings() {
  const { t } = useTranslation()
  const { adminToken } = useAuth()

  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState('form') // 'form' | 'otp'
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRequestOtp(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!newEmail && !newPassword) {
      setError(t('admin.settings.errorEmpty'))
      return
    }
    if (newPassword && newPassword !== confirmPassword) {
      setError(t('admin.settings.errorPasswordMismatch'))
      return
    }

    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_SETTINGS_REQUEST_OTP, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      })
      if (!res.ok) throw new Error()
      setStep('otp')
    } catch {
      setError(t('admin.settings.errorRequest'))
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_SETTINGS_CONFIRM, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          otp,
          newEmail: newEmail || undefined,
          newPassword: newPassword || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      setSuccess(t('admin.settings.success'))
      setStep('form')
      setNewEmail('')
      setNewPassword('')
      setConfirmPassword('')
      setOtp('')
    } catch (err) {
      setError(err.message === 'Invalid or expired OTP'
        ? t('admin.settings.errorOtp')
        : t('admin.settings.errorRequest'))
    } finally {
      setLoading(false)
    }
  }

  function handleCancel() {
    setStep('form')
    setOtp('')
    setError('')
  }

  return (
    <section className="admin-settings">
      <h2>{t('admin.settings.title')}</h2>

      {success && <p className="success">{success}</p>}

      {step === 'form' ? (
        <form onSubmit={handleRequestOtp} className="settings-form">
          {error && <p className="error">{error}</p>}
          <div className="form-group">
            <label>{t('admin.settings.newEmail')}</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder={t('admin.settings.newEmailPlaceholder')}
            />
          </div>
          <div className="form-group">
            <label>{t('admin.settings.newPassword')}</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder={t('admin.settings.newPasswordPlaceholder')}
            />
          </div>
          {newPassword && (
            <div className="form-group">
              <label>{t('admin.settings.confirmPassword')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('admin.settings.confirmPasswordPlaceholder')}
              />
            </div>
          )}
          <button type="submit" disabled={loading}>
            {loading ? '…' : t('admin.settings.requestOtp')}
          </button>
        </form>
      ) : (
        <form onSubmit={handleConfirm} className="settings-form">
          <p>{t('admin.settings.otpSent')}</p>
          {error && <p className="error">{error}</p>}
          <div className="form-group">
            <label>{t('admin.otp')}</label>
            <input
              type="text"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              autoFocus
              required
            />
          </div>
          <div className="form-actions">
            <button type="submit" disabled={loading}>
              {loading ? '…' : t('admin.verify')}
            </button>
            <button type="button" onClick={handleCancel}>{t('admin.cancel')}</button>
          </div>
        </form>
      )}
    </section>
  )
}
