import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getMLStatus } from '../api/client'
import type { MLStatusResponse } from '../api/types'

export function MLModelsPage() {
  const [status, setStatus] = useState<MLStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getMLStatus(controller.signal)
      .then(res => {
        setStatus(res)
        setError(null)
      })
      .catch(err => {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Unable to load ML telemetry')
        }
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  return (
    <div className="page-wrap ml-models-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">RESEARCH & MACHINE LEARNING · MODEL TELEMETRY</div>
          <h1>Player Style Clustering Model</h1>
          <p>
            Unsupervised K-Means clustering pipeline trained on live player DNA features.
            Strictly separates live registered player evaluations from historical benchmark cohorts.
          </p>
        </div>
        <span className="phase-badge">
          <span className="phase-dot" /> K-MEANS PIPELINE
        </span>
      </header>

      {/* Sub-navigation */}
      <nav className="research-subnav" aria-label="Research sub-navigation">
        <Link to="/research" className="subnav-pill">Overview & Dataset</Link>
        <Link to="/research/player-dna" className="subnav-pill">30-Player DNA Analysis</Link>
        <Link to="/matchmaking" className="subnav-pill">Cohort Distance Matching</Link>
        <Link to="/research/ml-models" className="subnav-pill is-active">Style Clustering Model</Link>
        <Link to="/research/ai-arena" className="subnav-pill">AI Engine Arena</Link>
      </nav>

      {error ? (
        <section className="state-panel" role="alert">
          <h2>ML Telemetry Unavailable</h2>
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="state-panel" aria-live="polite">
          Inspecting machine learning model status and live player dataset…
        </section>
      ) : status ? (
        <>
          {/* Real Readiness Status Card */}
          <section className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ fontSize: '18px', margin: 0 }}>Model Readiness & Training Requirements</h2>
                  <span
                    style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      background: status.status === 'ready' ? 'rgba(163, 230, 53, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: status.status === 'ready' ? 'var(--color-lime)' : 'var(--color-danger, #ef4444)',
                    }}
                  >
                    {status.status === 'ready' ? 'Active Model In Production' : 'Unmet Prerequisites'}
                  </span>
                </div>
                <p style={{ fontSize: '13.5px', color: 'var(--color-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                  {status.message}
                </p>
              </div>

              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-muted)', textTransform: 'uppercase' }}>Clustering Algorithm</span>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>K-Means (k = 3)</div>
              </div>
            </div>

            {/* Requirement progress bar */}
            <div style={{ marginTop: '16px', background: 'rgba(0,0,0,0.25)', padding: '16px', borderRadius: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '8px' }}>
                <span>Eligible Live Players: <strong>{status.analyzed_users_count}</strong> of {status.required_users_count} required</span>
                <span style={{ color: status.analyzed_users_count >= status.required_users_count ? 'var(--color-lime)' : '#f87171' }}>
                  {Math.round((status.analyzed_users_count / status.required_users_count) * 100)}% Complete
                </span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, (status.analyzed_users_count / status.required_users_count) * 100)}%`,
                    height: '100%',
                    background: status.analyzed_users_count >= status.required_users_count ? 'var(--color-lime)' : '#f87171',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
              <small style={{ display: 'block', marginTop: '8px', color: 'var(--color-muted)', fontSize: '11.5px' }}>
                * Eligibility criterion: Each subject must be a registered player with at least 3 fully analyzed games. Historical Kaggle cohorts are excluded to prevent synthetic bias.
              </small>
            </div>
          </section>

          {/* Feature Vector & Architectural Pipeline */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px', marginBottom: '24px' }}>
            <section className="panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>DNA Feature Vector</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--color-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
                The clustering model operates on normalized centipawn loss and precision metrics extracted by the background Stockfish analysis worker.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                {['median_cpl', 'cpl_std', 'inaccuracies_per_100_cp_moves'].map(f => (
                  <div key={f} style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <code style={{ color: 'var(--color-lime)', fontWeight: 600 }}>{f}</code>
                    <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                      {f === 'median_cpl' && 'Median centipawn loss across all non-book moves. Measures tactical baseline accuracy.'}
                      {f === 'cpl_std' && 'Standard deviation of centipawn loss. Quantifies move-to-move volatility.'}
                      {f === 'inaccuracies_per_100_cp_moves' && 'Rate of tactical inaccuracies (50-100 cp loss) per 100 evaluated turns.'}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Cluster Archetypes (Target K=3)</h3>
              <p style={{ fontSize: '12.5px', color: 'var(--color-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
                When the minimum dataset threshold is met, the unsupervised clustering pipeline categorizes players into three behavioral archetypes:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: '#38bdf8' }}>Cluster 0 · Tactical / Sharp</strong>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                    Higher volatility (`cpl_std`), rapid piece exchanges, aggressive complications with occasional sharp swings.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: 'var(--color-lime)' }}>Cluster 1 · Positional / Classical</strong>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                    Low median CPL, low standard deviation, steady strategic maneuvers and minimal blunders.
                  </div>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <strong style={{ color: '#fb923c' }}>Cluster 2 · Dynamic / Universal</strong>
                  <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
                    Balanced error rate, pragmatic counter-play adjusting between sharp tactics and solid endgames.
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Operational Boundaries */}
          <section className="panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', marginBottom: '10px' }}>Scientific & Privacy Boundaries</h3>
            <ul style={{ fontSize: '12.5px', color: 'var(--color-muted)', lineHeight: 1.6, paddingLeft: '20px', margin: 0 }}>
              <li><strong>Zero Synthetic Data:</strong> Model training and cluster metrics are never fabricated or seeded with synthetic estimates.</li>
              <li><strong>Strict Isolation:</strong> Historical cohort statistics and registered player accounts exist in strictly isolated database models.</li>
              <li><strong>Server Authorization:</strong> Machine learning telemetry endpoints enforce backend administrator permissions.</li>
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
