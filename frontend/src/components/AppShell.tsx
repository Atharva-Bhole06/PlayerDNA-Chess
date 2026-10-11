import { Link, NavLink, Outlet } from 'react-router'
import { ConnectionStatus } from './ConnectionStatus'

const navigation = [
  { to: '/', label: 'Overview', icon: '◫', end: true },
  { to: '/player-dna', label: 'Player DNA', icon: '◎' },
  { to: '/matchmaking', label: 'AI Matchmaking', icon: '⌘' },
  { to: '/live-chess', label: 'Live Chess & Analysis', icon: '♞' },
]

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/" aria-label="PlayerDNA AI home">
          <span className="brand-mark" aria-hidden="true">P</span>
          <span className="brand-copy"><strong>PlayerDNA</strong><small>CHESS INTELLIGENCE</small></span>
        </Link>
        <div className="nav-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Primary navigation">
          {navigation.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/live-chess' && <span className="nav-live-dot" aria-label="Live" />}
            </NavLink>
          ))}
          <NavLink to="/account" className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}>
            <span className="nav-icon" aria-hidden="true">◉</span><span>Account</span>
          </NavLink>
        </nav>
        <div className="sidebar-bottom">
          <ConnectionStatus />
          <div className="sidebar-footer"><span className="footer-mark">PD</span><span>PlayerDNA AI</span><span className="version-tag">M1</span></div>
        </div>
      </aside>
      <main className="main-content"><Outlet /></main>
    </div>
  )
}
