import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { getCurrentUser, getHealth, getLeaderboard, getPlayers, getRecentGames } from '../api/client'
import type { AuthenticatedProfile, HealthResponse, LeaderboardEntry, PlayerSummary, RecentGame } from '../api/types'

export function OverviewPage() {
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[] | null>(null)
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null)
  const [account, setAccount] = useState<AuthenticatedProfile | null>(null)
  const [recentGames, setRecentGames] = useState<RecentGame[] | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    Promise.all([getHealth(controller.signal), getPlayers()]).then(([h, p]) => { setHealth(h); setPlayers(p) }).catch(e => {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to load overview')
    })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    getLeaderboard().then(setLeaderboard).catch(e => setLeaderboardError(e instanceof Error ? e.message : 'Leaderboard unavailable'))
    getCurrentUser().then(user => { setAccount(user); if (user) getRecentGames().then(setRecentGames).catch(() => setRecentGames([])) }).catch(() => undefined)
  }, [])
  const ratingCount = players?.filter(p => p.mean_player_rating !== null).length ?? 0
  const gameCount = players?.filter(p => p.games_analyzed !== null).length ?? 0
  const averageRating = players && ratingCount ? players.reduce((sum, p) => sum + (p.mean_player_rating ?? 0), 0) / ratingCount : null
  const averageGames = players && gameCount ? players.reduce((sum, p) => sum + (p.games_analyzed ?? 0), 0) / gameCount : null
  return <div className="page-wrap">
    <header className="page-header"><div><div className="eyebrow">YOUR WORKSPACE</div><h1>Overview</h1><p>Competitive chess results and the analyzed historical player cohort.</p></div><Link className="primary-action play-now-link" to="/matchmaking">Play Now</Link></header>
    <section className="panel platform-dashboard">
      <div className="section-heading"><div><div className="eyebrow">REGISTERED PLAYERS</div><h2>{account ? `Welcome, ${account.username}` : 'Competitive leaderboard'}</h2><p>{account ? `Your Elo rating is ${account.rating}. Results below come from completed platform games.` : 'Sign in to track your competitive rating and recent games.'} Every registered player is listed; ratings are provisional for the first five games, and rating ties sort by username.</p></div>{account ? <Link to="/account">Open account →</Link> : <Link to="/account">Sign in / Register →</Link>}</div>
      {account && <div className="dashboard-stats"><Metric label="Competitive rating" value={account.rating} note="Elo · provisional until five games" /><Metric label="Games" value={account.games_played} note={`${account.wins} wins · ${account.draws} draws · ${account.losses} losses`} /><Metric label="Leaderboard rank" value={leaderboard?.find(row => row.username === account.username)?.rank ?? '—'} note="Ties sorted by username" /></div>}
      {leaderboardError ? <div className="empty-state" role="status">Leaderboard unavailable: {leaderboardError}</div> : leaderboard === null ? <div className="empty-state" aria-live="polite">Loading registered player results…</div> : leaderboard.length === 0 ? <div className="empty-state">No registered players yet. Create an account to be listed after your first completed game.</div> : <div className="leaderboard-wrap"><table className="leaderboard-table"><thead><tr><th>Rank</th><th>Player</th><th>Elo</th><th>Games</th><th>W</th><th>L</th><th>D</th><th>Win rate</th></tr></thead><tbody>{leaderboard.slice(0, 10).map(row => <tr key={row.username}><td>{row.rank}</td><td><Link to={`/profiles/${encodeURIComponent(row.username)}`}>{row.username}</Link></td><td>{row.rating}</td><td>{row.games_played}</td><td>{row.wins}</td><td>{row.losses}</td><td>{row.draws}</td><td>{row.win_rate === null ? '—' : `${(row.win_rate * 100).toFixed(1)}%`}</td></tr>)}</tbody></table></div>}
      {account && <div className="recent-games"><h3>Recent completed games</h3>{recentGames === null ? <p>Loading your games…</p> : recentGames.length === 0 ? <p>No completed games yet.</p> : <ul>{recentGames.map(game => <li key={game.game_id}><span>{game.result.toUpperCase()} vs <Link to={`/profiles/${encodeURIComponent(game.opponent_username)}`}>{game.opponent_username}</Link> · {game.opponent_rating}</span><strong className={game.rating_change >= 0 ? 'rating-up' : 'rating-down'}>{game.rating_change >= 0 ? '+' : ''}{game.rating_change} Elo</strong><span>{game.stars === null ? `Analysis ${game.analysis_status}` : `${'★'.repeat(game.stars)} performance`}</span><Link to={`/live-chess?game=${encodeURIComponent(game.game_id)}`}>View report</Link></li>)}</ul>}</div>}
    </section>
    {error ? <section className="state-panel" role="alert"><h2>Overview unavailable</h2><p>{health === null ? 'The backend could not be reached or player data is unavailable.' : error}</p></section> : players === null ? <section className="state-panel" aria-live="polite">Loading player overview…</section> : <>
      {health && (!health.database_available || health.status !== 'ok') && <div className="notice" role="status">Backend database is unavailable. Player data may be incomplete.</div>}
      <div className="metric-grid">
        <Metric label="Available players" value={String(players.length)} note="Count of players returned by the API" />
        <Metric label="Mean rating" value={averageRating === null ? '—' : averageRating.toFixed(0)} note={`${ratingCount} players with a reported rating`} />
        <Metric label="Mean games analyzed" value={averageGames === null ? '—' : averageGames.toFixed(1)} note={`${gameCount} players with a reported game count`} />
      </div>
      <section className="panel overview-list"><div className="section-heading"><div><h2>Player cohort</h2><p>Choose a profile to explore its returned performance and DNA measurements.</p></div><Link to="/player-dna">Explore Player DNA →</Link></div>
        {players.length === 0 ? <div className="empty-state">No players are currently available.</div> : <div className="player-table">{players.map(player => <Link className="player-row" key={player.player_id} to={`/player-dna?player=${encodeURIComponent(player.player_id)}`}><strong>{player.player_id}</strong><span>{player.games_analyzed === null ? 'Games unavailable' : `${player.games_analyzed} games`}</span><span>{player.mean_player_rating === null ? 'Rating unavailable' : `Rating ${player.mean_player_rating}`}</span><span>{player.win_rate_pct === null ? 'Win rate unavailable' : `${player.win_rate_pct}% win rate`}</span><b aria-hidden="true">→</b></Link>)}</div>}
      </section>
    </>}
  </div>
}
function Metric({ label, value, note }: { label: string; value: string | number; note: string }) { return <section className="panel metric-card"><span>{label}</span><strong>{value}</strong><small>{note}</small></section> }
