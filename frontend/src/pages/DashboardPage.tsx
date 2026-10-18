import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import { getLeaderboard, getRecentGames } from '../api/client'
import type { LeaderboardEntry, RecentGame } from '../api/types'
import {
  IconAI,
  IconCoach,
  IconSwords,
  IconTrophy,
} from '../components/Icons'

export function DashboardPage() {
  const { user, refreshUser } = useAuth()
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [leaderboardLoading, setLeaderboardLoading] = useState(true)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)

  const [recentGames, setRecentGames] = useState<RecentGame[]>([])
  const [recentGamesLoading, setRecentGamesLoading] = useState(true)
  const [recentGamesError, setRecentGamesError] = useState<string | null>(null)

  const loadLeaderboardData = () => {
    setLeaderboardLoading(true)
    setLeaderboardError(null)
    getLeaderboard()
      .then((data) => {
        setLeaderboard(data.slice(0, 3))
        setLeaderboardLoading(false)
      })
      .catch((err) => {
        setLeaderboardError(err instanceof Error ? err.message : 'Unable to load leaderboard')
        setLeaderboardLoading(false)
      })
  }

  const loadRecentGamesData = () => {
    setRecentGamesLoading(true)
    setRecentGamesError(null)
    getRecentGames()
      .then((games) => {
        setRecentGames(games)
        setRecentGamesLoading(false)
      })
      .catch((err) => {
        setRecentGamesError(err instanceof Error ? err.message : 'Unable to load recent games')
        setRecentGamesLoading(false)
      })
  }

  useEffect(() => {
    loadLeaderboardData()
    loadRecentGamesData()
    void refreshUser()
  }, [])

  const gamesPlayed = user ? user.games_played : 0
  const rating = user ? user.rating : 1200
  const isProvisional = gamesPlayed < 5
  const winRate = gamesPlayed > 0 && user ? Math.round((user.wins / gamesPlayed) * 100) : null
  const isNewAccount = gamesPlayed === 0

  return (
    <div className="page-wrap dashboard-page">
      {/* Welcome & Primary Arena Action Banner */}
      <header className="dashboard-hero panel" aria-label="Dashboard banner">
        <div className="dashboard-hero-content">
          <div className="eyebrow">COMPETITIVE HEADQUARTERS</div>
          <h1>Welcome, {user ? user.username : 'Player'}</h1>
          <p>
            Track your competitive rank, jump directly into a game, and review your performance reports.
          </p>
        </div>
        <div className="dashboard-hero-action">
          <Link to="/play" className="primary-action hero-play-btn" id="dashboard-play-cta">
            Open Play Arena →
          </Link>
        </div>
      </header>

      {/* New Account Onboarding Callout (Clean empty state) */}
      {isNewAccount && (
        <section className="dashboard-onboarding-callout panel" aria-label="New player guide">
          <div className="callout-icon-wrap" aria-hidden="true">
            <IconTrophy size={24} />
          </div>
          <div className="callout-copy">
            <h3>Ready for your first match?</h3>
            <p>
              Your Elo rating starts at 1200 in provisional status. Play 5 rated matches to establish your
              competitive rank, or warm up with unrated practice and AI sparring.
            </p>
          </div>
          <Link to="/play" className="secondary-action">
            Play First Game
          </Link>
        </section>
      )}

      {/* Personal Statistics Grid */}
      <section className="dashboard-stats-grid" aria-label="Personal competitive statistics">
        <div className="stat-card panel">
          <span className="stat-label">Competitive Rating</span>
          <strong className="stat-value text-lime">{rating}</strong>
          <small className="stat-meta">
            {isProvisional ? `Provisional (${gamesPlayed}/5 games)` : 'Established Elo'}
          </small>
        </div>

        <div className="stat-card panel">
          <span className="stat-label">Match Record</span>
          <strong className="stat-value">
            {user ? `${user.wins}W · ${user.losses}L · ${user.draws}D` : '0W · 0L · 0D'}
          </strong>
          <small className="stat-meta">
            {winRate !== null ? `${winRate}% Win Rate` : 'No matches recorded'}
          </small>
        </div>

        <div className="stat-card panel">
          <span className="stat-label">Total Matches</span>
          <strong className="stat-value">{gamesPlayed}</strong>
          <small className="stat-meta">Server-validated</small>
        </div>

        <div className="stat-card panel">
          <span className="stat-label">Tactical DNA</span>
          <strong className="stat-value" style={{ fontSize: '18px', textTransform: 'capitalize' }}>
            {user?.player_dna_status ? user.player_dna_status.replace(/_/g, ' ') : 'Pending Games'}
          </strong>
          <small className="stat-meta">
            {gamesPlayed >= 3 ? 'Style cluster calibrated' : 'Requires 3+ analyzed matches'}
          </small>
        </div>
      </section>

      {/* 5 Supported Play Mode Launchers Grid */}
      <section className="play-modes-section" aria-label="Play modes">
        <div className="section-heading">
          <div>
            <h2>Choose a Game Mode</h2>
            <p>Select your preferred format to play today</p>
          </div>
        </div>
        <div className="modes-launcher-grid">
          <Link to="/play?mode=unrated" className="mode-launcher-card panel">
            <div className="mode-launcher-icon mode-lime" aria-hidden="true">
              <IconSwords size={22} />
            </div>
            <div className="mode-launcher-info">
              <h3>Play Casual</h3>
              <p>Unrated games against another human. Practice and warm up without rating stakes.</p>
            </div>
            <span className="launcher-arrow">→</span>
          </Link>

          <Link to="/play?mode=competitive" className="mode-launcher-card panel">
            <div className="mode-launcher-icon mode-lime" aria-hidden="true">
              <IconTrophy size={22} />
            </div>
            <div className="mode-launcher-info">
              <h3>Competitive Matchmaking</h3>
              <p>Queue for rated multiplayer games with Elo pairing and rank updates.</p>
            </div>
            <span className="launcher-arrow">→</span>
          </Link>

          <Link to="/play?mode=ai" className="mode-launcher-card panel">
            <div className="mode-launcher-icon mode-cyan" aria-hidden="true">
              <IconAI size={22} />
            </div>
            <div className="mode-launcher-info">
              <h3>Play Stockfish AI</h3>
              <p>Test your calculation against the UCI chess engine with real-time hint support.</p>
            </div>
            <span className="launcher-arrow">→</span>
          </Link>

          <Link to="/play?mode=coach" className="mode-launcher-card panel">
            <div className="mode-launcher-icon mode-orange" aria-hidden="true">
              <IconCoach size={22} />
            </div>
            <div className="mode-launcher-info">
              <h3>Coach Mode <span className="mode-tab-badge">ASSISTED</span></h3>
              <p>Play against AI with real-time suggested moves, explanations, and position evaluations.</p>
            </div>
            <span className="launcher-arrow">→</span>
          </Link>
        </div>
      </section>

      {/* Bottom 2-Column: Leaderboard & Recent Matches */}
      <div className="dashboard-columns-grid">
        {/* Top 3 Competitive Leaderboard */}
        <section className="panel dashboard-card-section" aria-label="Competitive leaderboard">
          <div className="section-heading">
            <div>
              <h2>Platform Top 3</h2>
              <p>Top registered competitive players</p>
            </div>
          </div>
          {leaderboardLoading ? (
            <div className="empty-state" aria-live="polite">Loading rankings…</div>
          ) : leaderboardError ? (
            <div className="empty-state error-state">
              <p>{leaderboardError}</p>
              <button type="button" onClick={loadLeaderboardData} className="secondary-action" style={{ marginTop: '8px' }}>
                Retry
              </button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="empty-state">No registered players ranked yet. Play matches to establish the top 3!</div>
          ) : (
            <div className="top3-list">
              {leaderboard.map((entry, idx) => (
                <div key={entry.username} className="top3-item">
                  <span className={`top3-rank top3-rank-${idx + 1}`}>#{entry.rank}</span>
                  <div className="top3-name">
                    <Link to={`/profiles/${encodeURIComponent(entry.username)}`} className="top3-player-link">
                      <strong>{entry.username}</strong>
                    </Link>
                    <small>
                      {entry.games_played} games · {entry.wins}W · {entry.losses}L
                      {entry.win_rate !== null ? ` (${Math.round(entry.win_rate * 100)}%)` : ''}
                    </small>
                  </div>
                  <strong className="top3-rating text-lime">{entry.rating} Elo</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Matches */}
        <section className="panel dashboard-card-section" aria-label="Recent games">
          <div className="section-heading">
            <div>
              <h2>Recent Matches</h2>
              <p>Your latest server-recorded games</p>
            </div>
            <Link to="/history">All History →</Link>
          </div>
          {recentGamesLoading ? (
            <div className="empty-state" aria-live="polite">Loading matches…</div>
          ) : recentGamesError ? (
            <div className="empty-state error-state">
              <p>{recentGamesError}</p>
              <button type="button" onClick={loadRecentGamesData} className="secondary-action" style={{ marginTop: '8px' }}>
                Retry
              </button>
            </div>
          ) : recentGames.length === 0 ? (
            <div className="empty-state">
              <p>No games played yet on this account.</p>
              <Link to="/play" className="secondary-action" style={{ marginTop: '8px' }}>
                Start Your First Game
              </Link>
            </div>
          ) : (
            <div className="recent-games-list">
              {recentGames.map((game) => {
                const isWin = game.result === 'win'
                const isLoss = game.result === 'loss'
                const resultClass = isWin ? 'result-win' : isLoss ? 'result-loss' : 'result-draw'
                const ratingChangeFormatted = game.rating_change > 0 ? `+${game.rating_change}` : `${game.rating_change}`

                return (
                  <div key={game.game_id} className="recent-game-row">
                    <div className="recent-game-meta">
                      <strong>
                        vs {game.opponent_username || 'Opponent'} ({game.opponent_rating})
                      </strong>
                      <small>
                        as {game.color === 'white' ? 'White' : 'Black'} · {game.termination} · {new Date(game.finished_at).toLocaleDateString()}
                      </small>
                    </div>
                    <div className="recent-game-badge-group">
                      <span className={`game-result-pill ${resultClass}`}>
                        {game.result.toUpperCase()} ({ratingChangeFormatted})
                      </span>
                      {game.stars !== null && (
                        <span className="game-stars-badge">{game.stars} ★</span>
                      )}
                    </div>
                    <Link
                      to={`/live-chess?game=${encodeURIComponent(game.game_id)}`}
                      className="secondary-action report-link"
                    >
                      Report →
                    </Link>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
