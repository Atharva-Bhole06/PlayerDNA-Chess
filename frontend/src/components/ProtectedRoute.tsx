import { Link, Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../context/AuthContext'
import type { ReactNode } from 'react'

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: {
  children?: ReactNode
  requireAdmin?: boolean
}) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="page-wrap">
        <section className="state-panel" aria-live="polite">
          Verifying session authentication…
        </section>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (requireAdmin && !user.is_admin) {
    return (
      <div className="page-wrap">
        <section className="state-panel" role="alert" style={{ maxWidth: '640px', margin: '60px auto' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ color: 'var(--color-danger, #ef4444)' }}>403 Forbidden — Administrator Privileges Required</h2>
          <p style={{ marginTop: '12px', color: 'var(--color-muted)' }}>
            Research datasets, AI-vs-AI experiment arenas, and ML model telemetry are restricted to operator accounts with administrative clearance.
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
            Logged in as <strong>{user.username}</strong> (Player account). To grant research permissions, an authorized operator must promote your account via the backend administration CLI.
          </p>
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/dashboard" className="btn btn-secondary">
              Back to Dashboard
            </Link>
            <Link to="/play" className="btn btn-primary">
              Play Chess
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return children ? <>{children}</> : <Outlet />
}
