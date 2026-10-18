import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../context/AuthContext'

interface AuthPageProps {
  initialMode?: 'login' | 'register'
}

export function AuthPage({ initialMode = 'login' }: AuthPageProps) {
  const { user, loading, error: authError, login, register } = useAuth()
  const [registerMode, setRegisterMode] = useState(initialMode === 'register')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [sessionTimedOut, setSessionTimedOut] = useState(false)

  const navigate = useNavigate()
  const location = useLocation()
  const searchFrom = new URLSearchParams(location.search).get('from')
  const destination = searchFrom || (location.state as { from?: { pathname?: string } })?.from?.pathname || '/dashboard'

  useEffect(() => {
    setRegisterMode(initialMode === 'register')
    setFormError(null)
  }, [initialMode])

  useEffect(() => {
    const timer = setTimeout(() => setSessionTimedOut(true), 2500)
    return () => clearTimeout(timer)
  }, [])

  if (!loading && user) {
    return <Navigate to={destination} replace />
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    setSubmitting(true)
    try {
      if (registerMode) {
        await register(username, password)
      } else {
        await login(username, password)
      }
      navigate(destination, { replace: true })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Authentication failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-viewport">
      {/* Dynamic Ambient Green Glow behind card */}
      <div className="ambient-glow ambient-glow--lime" aria-hidden="true" />

      <div className="auth-card-container">
        {/* Mascot Crest matching reference screenshot */}
        <div className="auth-mascot" aria-hidden="true">
          <svg width="72" height="72" viewBox="0 0 100 100" fill="none">
            <path d="M22 28L24 24L28 22L24 20L22 16L20 20L16 22L20 24Z" fill="#b4f300" opacity="0.85" />
            <path d="M82 22L83.5 19L86.5 17.5L83.5 16L82 13L80.5 16L77.5 17.5L80.5 19Z" fill="#b4f300" opacity="0.85" />
            <path
              d="M32 76V42C32 38.7 34.7 36 38 36C41.3 36 44 38.7 44 42V60"
              fill="#c86432"
            />
            <path
              d="M44 60V34C44 30.7 46.7 28 50 28C53.3 28 56 30.7 56 34V60"
              fill="#d97736"
            />
            <path
              d="M56 60V38C56 34.7 58.7 32 62 32C65.3 32 68 34.7 68 38V62"
              fill="#c86432"
            />
            <path
              d="M68 62V46C68 42.7 70.7 40 74 40C77.3 40 80 42.7 80 46V72C80 82 72 88 60 88H48C38 88 32 82 32 76Z"
              fill="#c86432"
            />
            <circle cx="43" cy="56" r="6" stroke="#2563eb" strokeWidth="2.5" fill="none" />
            <circle cx="57" cy="56" r="6" stroke="#2563eb" strokeWidth="2.5" fill="none" />
            <path d="M49 56H51" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
            <circle cx="43" cy="56" r="2" fill="#1e293b" />
            <circle cx="57" cy="56" r="2" fill="#1e293b" />
            <path
              d="M66 36C66 33.8 67.8 32 70 32C72.2 32 74 33.8 74 36C74 37.8 72.8 39.3 71.2 39.8L72.5 46H67.5L68.8 39.8C67.2 39.3 66 37.8 66 36Z"
              fill="#f8fafc"
              stroke="#cbd5e1"
              strokeWidth="1"
            />
            <rect x="36" y="86" width="36" height="8" rx="2" fill="#0f172a" />
            <rect x="40" y="86" width="4" height="4" fill="#f8fafc" />
            <rect x="48" y="86" width="4" height="4" fill="#f8fafc" />
            <rect x="56" y="86" width="4" height="4" fill="#f8fafc" />
            <rect x="64" y="86" width="4" height="4" fill="#f8fafc" />
          </svg>
        </div>

        <h1 className="auth-card-title">
          {registerMode ? 'Join PlayerDNA' : 'Sign in to PlayerDNA'}
        </h1>
        <p className="auth-card-subtitle">
          {registerMode
            ? 'Create an account to track your rating, record matches, and analyze your style.'
            : 'Enter your credentials to access your personal player dashboard.'}
        </p>

        {/* Mode Toggle Tabs */}
        <div className="auth-mode-switch" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={!registerMode}
            className={`auth-switch-tab ${!registerMode ? 'is-active' : ''}`}
            onClick={() => {
              setRegisterMode(false)
              setFormError(null)
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={registerMode}
            className={`auth-switch-tab ${registerMode ? 'is-active' : ''}`}
            onClick={() => {
              setRegisterMode(true)
              setFormError(null)
            }}
          >
            Create Account
          </button>
        </div>

        {loading && !sessionTimedOut ? (
          <div className="auth-loading-state" aria-live="polite">
            Checking session…
          </div>
        ) : (
          <form className="auth-card-form" onSubmit={handleSubmit}>
            <label className="auth-field-label">
              <span>Username</span>
              <input
                autoComplete="username"
                minLength={3}
                maxLength={32}
                pattern="[A-Za-z0-9._\-]+"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username (letters, numbers, _ -)"
                className="auth-input"
              />
            </label>

            <label className="auth-field-label">
              <span>Password</span>
              <input
                autoComplete={registerMode ? 'new-password' : 'current-password'}
                type="password"
                minLength={10}
                maxLength={128}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password (minimum 10 characters)"
                className="auth-input"
              />
            </label>

            {formError && (
              <div className="auth-error-box" role="alert">
                {formError}
              </div>
            )}
            {!formError && authError && (
              <div className="auth-error-box" role="alert">
                {authError}
              </div>
            )}

            <button
              className="auth-submit-btn"
              type="submit"
              disabled={submitting}
            >
              {submitting
                ? 'Authenticating…'
                : registerMode
                ? 'Register Free Profile'
                : 'Sign In'}
            </button>
          </form>
        )}

        <div className="auth-card-footer">
          <small className="auth-security-note">
            Protected by secure HTTP-only cookie sessions.
          </small>
          <Link to="/" className="auth-back-link">
            ← Return to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
