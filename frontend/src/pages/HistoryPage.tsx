import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ApiError, getRecentGames } from '../api/client'
import type { RecentGame } from '../api/types'

export function HistoryPage() {
  const [games, setGames] = useState<RecentGame[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await getRecentGames()
      setGames(data)
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Authentication required to view game history.')
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load match history.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadHistory()
  }, [])

  // Aggregate stats from the fetched games
  const totalGames = games.length
  const wins = games.filter(g => g.result === 'win').length
  const losses = games.filter(g => g.result === 'loss').length
  const draws = games.filter(g => g.result === 'draw').length
  const netRatingDelta = games.reduce((acc, g) => acc + g.rating_change, 0)

  return (
    <div className="page-wrap history-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">PERSONAL RECORD · COMPETITIVE HISTORY</div>
          <h1>Game History</h1>
          <p>Review your server-recorded rated games, rating progression, and Stockfish engine evaluations.</p>
        </div>
      </header>

      {/* Aggregate summary cards */}
      {!loading && !error && games.length > 0 && (
        <section className="history-summary-grid" aria-label="Game history summary">
          <div className="metric-card panel">
            <span>Recorded Matches</span>
            <strong>{totalGames}</strong>
            <small>Most recent games from server</small>
          </div>
          <div className="metric-card panel">
            <span>Record (W / L / D)</span>
            <strong className="text-lime">{wins}W · {losses}L · {draws}D</strong>
            <small>{totalGames > 0 ? `${Math.round((wins / totalGames) * 100)}% win rate` : 'No games'}</small>
          </div>
          <div className="metric-card panel">
            <span>Net Rating Change</span>
            <strong className={netRatingDelta > 0 ? 'text-lime' : netRatingDelta < 0 ? 'text-danger' : ''}>
              {netRatingDelta > 0 ? `+${netRatingDelta}` : `${netRatingDelta}`} Elo
            </strong>
            <small>Across displayed match history</small>
          </div>
        </section>
      )}

      {/* Main content container */}
      <section className="panel history-list-section" aria-label="Match records">
        <div className="section-heading">
          <div>
            <h2>Recorded Matches</h2>
            <p>Chronological match record ordered newest first</p>
          </div>
          {!loading && !error && games.length > 0 && (
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="secondary-action"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Refresh
            </button>
          )}
        </div>

        {loading ? (
          <div className="empty-state" aria-live="polite">
            <span className="loading-pulse" />
            <p style={{ marginTop: '12px' }}>Loading match history…</p>
          </div>
        ) : error ? (
          <div className="empty-state error-state" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadHistory()}
              className="secondary-action"
              style={{ marginTop: '12px' }}
            >
              Retry
            </button>
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <p>No recorded competitive games found on your account.</p>
            <small style={{ display: 'block', margin: '8px 0 16px', color: 'var(--color-subtle)' }}>
              Play matchmaking in the Play Arena to record rated matches and unlock Stockfish performance reports.
            </small>
            <Link to="/play" className="primary-action">
              Play Matchmaking
            </Link>
          </div>
        ) : (
          <div className="history-table-wrapper">
            <table className="history-table" aria-label="Match history list">
              <thead>
                <tr>
                  <th scope="col">Opponent</th>
                  <th scope="col">Color</th>
                  <th scope="col">Result</th>
                  <th scope="col">Rating Delta</th>
                  <th scope="col">Termination</th>
                  <th scope="col">Date</th>
                  <th scope="col">Analysis</th>
                  <th scope="col"><span className="visually-hidden">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {games.map(game => {
                  const isWin = game.result === 'win'
                  const isLoss = game.result === 'loss'
                  const resultClass = isWin ? 'result-win' : isLoss ? 'result-loss' : 'result-draw'
                  const ratingDeltaFormatted = game.rating_change > 0 ? `+${game.rating_change}` : `${game.rating_change}`

                  return (
                    <tr key={game.game_id} className="history-row">
                      <td className="history-col-opponent">
                        <Link
                          to={`/profiles/${encodeURIComponent(game.opponent_username)}`}
                          className="history-player-link"
                        >
                          <strong>{game.opponent_username}</strong>
                        </Link>
                        <span className="opponent-rating">({game.opponent_rating})</span>
                      </td>

                      <td className="history-col-color">
                        <span className={`color-badge color-badge--${game.color}`}>
                          {game.color === 'white' ? '♔ White' : '♚ Black'}
                        </span>
                      </td>

                      <td className="history-col-result">
                        <span className={`game-result-pill ${resultClass}`}>
                          {game.result.toUpperCase()}
                        </span>
                      </td>

                      <td className="history-col-rating">
                        <div className="rating-progression">
                          <span className="rating-before-after">
                            {game.rating_before} → {game.rating_after}
                          </span>
                          <strong className={`rating-delta ${game.rating_change > 0 ? 'text-lime' : game.rating_change < 0 ? 'text-danger' : ''}`}>
                            ({ratingDeltaFormatted})
                          </strong>
                        </div>
                      </td>

                      <td className="history-col-term">
                        <span className="termination-text">{formatTermination(game.termination)}</span>
                      </td>

                      <td className="history-col-date">
                        <time dateTime={game.finished_at}>
                          {new Date(game.finished_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </time>
                      </td>

                      <td className="history-col-analysis">
                        <AnalysisStatusBadge status={game.analysis_status} stars={game.stars} />
                      </td>

                      <td className="history-col-actions">
                        <Link
                          to={`/report/${encodeURIComponent(game.game_id)}`}
                          className="secondary-action review-link"
                          aria-label={`Review match against ${game.opponent_username}`}
                        >
                          Review & Report →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function AnalysisStatusBadge({
  status,
  stars,
}: {
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'not_queued'
  stars: number | null
}) {
  if (status === 'completed') {
    return (
      <span className="analysis-status-badge badge-completed">
        {stars !== null ? `${'★'.repeat(stars)} (${stars}★)` : 'Analyzed'}
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="analysis-status-badge badge-processing">
        <span className="loading-pulse" /> Processing
      </span>
    )
  }
  if (status === 'queued') {
    return (
      <span className="analysis-status-badge badge-queued">
        Queued
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="analysis-status-badge badge-failed">
        Failed
      </span>
    )
  }
  return (
    <span className="analysis-status-badge badge-not-queued">
      Not queued
    </span>
  )
}

function formatTermination(term: string): string {
  if (!term) return 'Finished'
  return term
    .replaceAll('_', ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
