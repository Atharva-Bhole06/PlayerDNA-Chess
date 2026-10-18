import { Link, NavLink, Outlet, useLocation } from 'react-router'
import { BrandLogo } from './BrandLogo'
import {
  IconClock,
  IconDashboard,
  IconResearch,
  IconSwords,
  IconAI,
} from './Icons'
import { useAuth } from '../context/AuthContext'

export function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const isResearchArea = location.pathname.startsWith('/research') || location.pathname.startsWith('/player-dna')

  return (
    <div className="app-shell">
      <header className="top-navbar">
        <div className="nav-left-cluster">
          <Link className="brand" to="/" aria-label="PlayerDNA AI home">
            <BrandLogo size={32} />
            <div className="brand-copy">
              <strong>PlayerDNA</strong>
              <small>{isResearchArea ? 'RESEARCH PORTAL' : 'CHESS INTELLIGENCE'}</small>
            </div>
          </Link>

          <nav className="primary-nav" aria-label="Primary navigation">
            {!isResearchArea ? (
              <>
                <NavLink
                  to="/play"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconSwords size={16} className="nav-icon" aria-hidden="true" />
                  <span>Play</span>
                  <span className="nav-live-dot" aria-label="Live Arena" />
                </NavLink>

                <NavLink
                  to="/dashboard"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconDashboard size={16} className="nav-icon" aria-hidden="true" />
                  <span>Dashboard</span>
                </NavLink>

                <NavLink
                  to="/history"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconClock size={16} className="nav-icon" aria-hidden="true" />
                  <span>Game History</span>
                </NavLink>

                {user?.is_admin && (
                  <NavLink
                    to="/research"
                    className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                  >
                    <IconResearch size={16} className="nav-icon" aria-hidden="true" />
                    <span>Research Portal</span>
                  </NavLink>
                )}
              </>
            ) : (
              <>
                <NavLink
                  to="/research"
                  end
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconResearch size={16} className="nav-icon" aria-hidden="true" />
                  <span>Research Overview</span>
                </NavLink>

                <NavLink
                  to="/research/player-dna"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconAI size={16} className="nav-icon" aria-hidden="true" />
                  <span>Player DNA</span>
                </NavLink>

                <NavLink
                  to="/matchmaking"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconSwords size={16} className="nav-icon" aria-hidden="true" />
                  <span>Cohort Matching</span>
                </NavLink>

                <NavLink
                  to="/research/ai-arena"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconSwords size={16} className="nav-icon" aria-hidden="true" />
                  <span>AI Arena</span>
                </NavLink>

                <NavLink
                  to="/research/ml-models"
                  className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
                >
                  <IconAI size={16} className="nav-icon" aria-hidden="true" />
                  <span>ML Status</span>
                </NavLink>

                <NavLink
                  to="/play"
                  className="nav-link"
                >
                  <span className="nav-icon" aria-hidden="true">←</span>
                  <span>Back to Play</span>
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className="nav-actions">
          {user ? (
            <div className="user-pill-group">
              {user.is_admin && (
                <span style={{
                  background: 'rgba(163, 230, 53, 0.15)',
                  color: 'var(--color-lime)',
                  border: '1px solid rgba(163, 230, 53, 0.3)',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}>
                  Admin
                </span>
              )}
              <span className="user-rating-chip">{user.rating} Elo</span>
              <Link to="/account" className="user-profile-chip" aria-label="Account">
                <span className="avatar-letter">
                  {user.username.charAt(0).toUpperCase()}
                </span>
                <span>{user.username}</span>
              </Link>
              <button
                type="button"
                className="text-button"
                onClick={() => logout()}
                style={{ color: 'var(--color-muted)', fontSize: '11px', marginLeft: '4px' }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-action-group">
              <Link to="/login" className="btn-signin">
                Sign In
              </Link>
              <Link to="/signup" className="btn-register">
                Register for free
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
