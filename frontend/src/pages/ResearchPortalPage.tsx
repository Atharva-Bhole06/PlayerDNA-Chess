import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getHealth, getPlayers, getMLStatus, getExperiments } from '../api/client'
import type { HealthResponse, PlayerSummary, MLStatusResponse, AIExperiment } from '../api/types'
import { useAuth } from '../context/AuthContext'

export function ResearchPortalPage() {
  const { user } = useAuth()
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [mlStatus, setMlStatus] = useState<MLStatusResponse | null>(null)
  const [experiments, setExperiments] = useState<AIExperiment[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    Promise.allSettled([
      getHealth(controller.signal),
      getPlayers(controller.signal),
      getMLStatus(controller.signal),
      getExperiments(controller.signal),
    ])
      .then(([hRes, pRes, mlRes, expRes]) => {
        if (hRes.status === 'fulfilled') setHealth(hRes.value)
        if (pRes.status === 'fulfilled') {
          setPlayers(pRes.value)
        } else {
          setError(pRes.reason instanceof Error ? pRes.reason.message : 'Unable to load research data')
        }
        if (mlRes.status === 'fulfilled') setMlStatus(mlRes.value)
        if (expRes.status === 'fulfilled') setExperiments(expRes.value)
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : 'Unable to load research data')
        }
      })
    return () => controller.abort()
  }, [])

  const ratingCount = players?.filter(p => p.mean_player_rating !== null).length ?? 0
  const gameCount = players?.filter(p => p.games_analyzed !== null).length ?? 0
  const averageRating = players && ratingCount ? players.reduce((sum, p) => sum + (p.mean_player_rating ?? 0), 0) / ratingCount : null
  const averageGames = players && gameCount ? players.reduce((sum, p) => sum + (p.games_analyzed ?? 0), 0) / gameCount : null

  const isForbidden = error?.includes('403') || error?.includes('Administrator') || error?.includes('Forbidden')
  const isUnauthorized = error?.includes('401') || error?.includes('Authentication required')

  return (
    <div className="page-wrap research-portal">
      <header className="page-header">
        <div>
          <div className="eyebrow">RESEARCH & INTELLIGENCE PORTAL</div>
          <h1>Research & Datasets</h1>
          <p>
            Historical 30-player research cohort, offline Stockfish evaluations, and unsupervised ML experiments.
            Separated from live registered player accounts.
          </p>
        </div>
        <span className="phase-badge">
          <span className="phase-dot" /> COHORT DATASET
        </span>
      </header>

      {/* Quick Research Sub-navigation */}
      <nav className="research-subnav" aria-label="Research sub-navigation">
        <Link to="/research" className="subnav-pill is-active">Overview & Dataset</Link>
        <Link to="/research/player-dna" className="subnav-pill">30-Player DNA Analysis</Link>
        <Link to="/matchmaking" className="subnav-pill">Cohort Distance Matching</Link>
        <Link to="/research/ml-models" className="subnav-pill">Style Clustering Model</Link>
        <Link to="/research/ai-arena" className="subnav-pill">AI Engine Arena</Link>
      </nav>

      {error && (isForbidden || isUnauthorized) ? (
        <section className="state-panel" role="alert" style={{ maxWidth: '640px', margin: '40px auto' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔒</div>
          <h2 style={{ color: 'var(--color-danger, #ef4444)' }}>
            {isUnauthorized ? 'Authentication Required' : '403 Forbidden — Administrator Privileges Required'}
          </h2>
          <p style={{ marginTop: '12px', color: 'var(--color-muted)' }}>
            {isUnauthorized
              ? 'You must be signed in with an administrator account to inspect research cohort data and run engine experiments.'
              : 'Research APIs enforce server-side role-based access control. Your current account does not have administrator clearance.'}
          </p>
          <p style={{ marginTop: '8px', fontSize: '13px', color: 'var(--color-muted)' }}>
            {user ? (
              <>Current account: <strong>{user.username}</strong>. An operator can grant access via: <code>python -m backend.manage_admin promote {user.username}</code>.</>
            ) : (
              'Please sign in with an authorized administrator account.'
            )}
          </p>
          <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
            <Link to="/dashboard" className="btn btn-secondary">Back to Dashboard</Link>
            {!user && <Link to="/login" className="btn btn-primary">Sign In</Link>}
          </div>
        </section>
      ) : error && !players ? (
        <section className="state-panel" role="alert">
          <h2>Research Portal Unavailable</h2>
          <p>{error}</p>
        </section>
      ) : players === null ? (
        <section className="state-panel" aria-live="polite">
          Loading historical research cohort…
        </section>
      ) : (
        <>
          {health && (!health.database_available || health.status !== 'ok') && (
            <div className="notice" role="status">
              Backend database probe returned unavailable. Historical cohort metrics may be incomplete.
            </div>
          )}

          {/* Research Dataset Statistics */}
          <section className="metric-grid" aria-label="Dataset metrics">
            <div className="panel metric-card">
              <span>Cohort Subjects</span>
              <strong>{players.length}</strong>
              <small>Validated 30-player analysis cohort</small>
            </div>
            <div className="panel metric-card">
              <span>Mean Rating</span>
              <strong>{averageRating === null ? '—' : averageRating.toFixed(0)}</strong>
              <small>{ratingCount} players with recorded ratings</small>
            </div>
            <div className="panel metric-card">
              <span>Mean Games Analyzed</span>
              <strong>{averageGames === null ? '—' : averageGames.toFixed(1)}</strong>
              <small>{gameCount} players with engine evaluations</small>
            </div>
            <div className="panel metric-card">
              <span>AI Experiments</span>
              <strong>{experiments ? experiments.length : '—'}</strong>
              <small>Dual-engine runs recorded</small>
            </div>
          </section>

          {/* Research Systems Overview Cards */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            {/* Style Clustering Status */}
            <div className="panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>K-Means Style Clustering Model</h3>
                <span className={`status-badge status-${mlStatus?.status === 'ready' ? 'analyzed' : 'unmet'}`} style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: mlStatus?.status === 'ready' ? 'rgba(163, 230, 53, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: mlStatus?.status === 'ready' ? 'var(--color-lime)' : 'var(--color-danger, #ef4444)'
                }}>
                  {mlStatus?.status === 'ready' ? 'Model Ready' : 'Data Prerequisite Unmet'}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
                {mlStatus?.message || 'Unsupervised style clustering strictly requires genuine registered player games.'}
              </p>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Eligible Live Players: <strong>{mlStatus?.analyzed_users_count ?? 0}</strong> / {mlStatus?.required_users_count ?? 10} required</div>
                <div>Min Games per Subject: <strong>3</strong> analyzed games</div>
                <div>Features: <code>median_cpl, cpl_std, inaccuracies_per_100</code></div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <Link to="/research/ml-models" className="text-button" style={{ color: 'var(--color-lime)', fontSize: '13px' }}>
                  Inspect ML Clustering Diagnostics →
                </Link>
              </div>
            </div>

            {/* AI Engine Arena Overview */}
            <div className="panel" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '16px' }}>AI-vs-AI Experiment Arena</h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  background: 'rgba(56, 189, 248, 0.15)',
                  color: '#38bdf8'
                }}>
                  Stockfish 16 UCI
                </span>
              </div>
              <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
                Run reproducible engine-vs-engine matches between Novice, Intermediate, and Master configurations. Records auditable PGN traces.
              </p>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div>Supported Configurations: <strong>Novice (Skill 3), Intermediate (Skill 10), Master (Skill 20)</strong></div>
                <div>Concurrent Engines: <strong>2 Active Subprocesses with Clean UCI Termination</strong></div>
                <div>Completed Experiments: <strong>{experiments?.filter(e => e.status === 'completed').length ?? 0}</strong></div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <Link to="/research/ai-arena" className="text-button" style={{ color: 'var(--color-lime)', fontSize: '13px' }}>
                  Launch AI Engine Arena →
                </Link>
              </div>
            </div>
          </section>

          {/* Historical Player Cohort Table */}
          <section className="panel overview-list" aria-label="Historical player cohort">
            <div className="section-heading">
              <div>
                <h2>Historical Player Cohort</h2>
                <p>30-player research cohort with depth-10 Stockfish move audits and robust Player DNA vectors.</p>
              </div>
              <Link to="/research/player-dna" style={{ color: 'var(--color-lime)' }}>
                Open Player DNA Inspector →
              </Link>
            </div>
            {players.length === 0 ? (
              <div className="empty-state">No historical players currently available.</div>
            ) : (
              <div className="player-table">
                {players.map(player => (
                  <Link
                    key={player.player_id}
                    className="player-row"
                    to={`/research/player-dna?player=${encodeURIComponent(player.player_id)}`}
                  >
                    <strong>{player.player_id}</strong>
                    <span>
                      {player.games_analyzed === null ? 'Games unavailable' : `${player.games_analyzed} games`}
                    </span>
                    <span>
                      {player.mean_player_rating === null ? 'Rating unavailable' : `Rating ${player.mean_player_rating}`}
                    </span>
                    <span>
                      {player.win_rate_pct === null ? 'Win rate unavailable' : `${player.win_rate_pct}% win rate`}
                    </span>
                    <b aria-hidden="true" style={{ color: 'var(--color-lime)' }}>→</b>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
