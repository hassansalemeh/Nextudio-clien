import { useState } from 'react'
import { useAuth } from '../../../app/auth'
import Spinner from '../../../shared/components/Spinner'
import PageHeader from '../../../shared/components/PageHeader'
import PasswordField from '../../../shared/components/PasswordField'

function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    const message = await login(email, password)
    if (message) {
      setError(message)
      setSubmitting(false)
    }
  }

  return (
    <div className="card" style={{ maxWidth: '24rem', margin: '4rem auto' }}>
      <img className="login-logo" src="/nextudio-logo.webp" alt="Nextudio architects" />
      <PageHeader title="Log in" description="Sign in to manage your clients, projects, and work." />
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="form-field">
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <PasswordField
            label="Password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            required
          />
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting && <Spinner />} Log in
        </button>
        {error && <p className="error-message">{error}</p>}
      </form>
    </div>
  )
}

export default LoginPage
