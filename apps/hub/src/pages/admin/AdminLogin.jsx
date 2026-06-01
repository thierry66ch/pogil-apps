import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext'
import { API_ROUTES } from '@pogil/shared'

export default function AdminLogin() {
  const { t } = useTranslation()
  const { adminLogin } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState('credentials') // 'credentials' | 'otp'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_LOGIN, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error()
      setStep('otp')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  async function handleOtp(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(API_ROUTES.ADMIN_VERIFY_OTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, otp }),
      })
      if (!res.ok) throw new Error()
      const { token } = await res.json()
      adminLogin(token)
      navigate('/admin')
    } catch {
      setError(t('login.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      {step === 'credentials' ? (
        <form onSubmit={handleCredentials} className="login-form">
          <h1>{t('admin.login')}</h1>
          {error && <p className="error">{error}</p>}
          <input
            type="email"
            placeholder={t('login.email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <input
            type="password"
            placeholder={t('login.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>{loading ? '…' : t('login.submit')}</button>
        </form>
      ) : (
        <form onSubmit={handleOtp} className="login-form">
          <h1>{t('admin.otp')}</h1>
          <p>{t('admin.otpSent')}</p>
          {error && <p className="error">{error}</p>}
          <input
            type="text"
            placeholder={t('admin.otp')}
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            required
            autoFocus
          />
          <button type="submit" disabled={loading}>{loading ? '…' : t('admin.verify')}</button>
        </form>
      )}
    </div>
  )
}
