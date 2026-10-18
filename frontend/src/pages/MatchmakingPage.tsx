import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError, cancelQueue, getMatchmaking, getPlayers, getQueueStatus, joinQueue } from '../api/client'
import type { MatchmakingResponse, PlayerSummary, QueueStatus } from '../api/types'
import { AuthContext } from '../context/AuthContext'
import { IconTrophy } from '../components/Icons'

export function MatchmakingPage() {
  const navigate = useNavigate()
  const auth = useContext(AuthContext)
  const user = auth?.user ?? null
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('player') ?? ''

  // Competitive Queue state for ordinary players
  const queueTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [queueState, setQueueState] = useState<'idle' | 'waiting' | 'matched' | 'error'>('idle')
  const [queueMessage, setQueueMessage] = useState('')
  const [waitSeconds, setWaitSeconds] = useState(0)
  const [ratingWindow, setRatingWindow] = useState<number | null>(null)

  useEffect(() => () => {
    if (queueTimer.current) clearInterval(queueTimer.current)
  }, [])

  // Cohort recommendation states (used only when explicit ?player= is provided, e.g. research/tests)
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<MatchmakingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)

  // Only load research cohort players if an explicit cohort player query param exists
  useEffect(() => {
    if (!selectedId || players !== null) return
    const controller = new AbortController()
    getPlayers(controller.signal).then(setPlayers).catch(error => {
      if (!controller.signal.aborted) setPlayerError(error instanceof Error ? error.message : 'Unable to load players')
    })
    return () => controller.abort()
  }, [selectedId, players])

  const selectedPlayer = players?.find(player => player.player_id === selectedId)
  useEffect(() => {
    if (!selectedId) return
    setResult(null)
    setRecommendationError(null)
    if (!selectedPlayer) { setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    getMatchmaking(selectedId, controller.signal).then(response => {
      if (!controller.signal.aborted) setResult(response)
    }).catch(error => {
      if (!controller.signal.aborted) {
        const message = error instanceof ApiError && error.status === 404
          ? 'The selected player was not found by the matchmaking service.'
          : error instanceof Error ? error.message : 'Unable to load recommendations'
        setRecommendationError(message)
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [selectedId, selectedPlayer])

  const filteredPlayers = useMemo(() => (players ?? []).filter(player => player.player_id === selectedId || player.player_id.toLowerCase().includes(query.trim().toLowerCase())), [players, query, selectedId])
  const currentResult = result?.player_id === selectedId ? result : null
  const choosePlayer = (playerId: string) => setParams(playerId ? { player: playerId } : {})

  const handleQueueState = (queue: QueueStatus) => {
    if (queue.status === 'matched' && queue.game_id) {
      if (queueTimer.current) clearInterval(queueTimer.current)
      queueTimer.current = null
      setQueueState('matched')
      setQueueMessage('Match found! Entering live game…')
      navigate(`/live-chess?game=${encodeURIComponent(queue.game_id)}`)
    } else if (queue.status === 'waiting') {
      setQueueState('waiting')
      setWaitSeconds(queue.wait_seconds)
      setRatingWindow(queue.rating_window ?? 100)
      setQueueMessage(`Searching for an opponent near your Elo · ${queue.wait_seconds}s · ±${queue.rating_window ?? 100} rating`)
    }
  }

  const startQueue = async () => {
    setQueueMessage('')
    try {
      const initial = await joinQueue('competitive')
      handleQueueState(initial)
      if (initial.status === 'waiting' && !queueTimer.current) {
        queueTimer.current = setInterval(() => {
          getQueueStatus().then(handleQueueState).catch(error => {
            setQueueState('error')
            setQueueMessage(error instanceof Error ? error.message : 'Queue status unavailable')
          })
        }, 2000)
      }
    } catch (error) {
      setQueueState('error')
      setQueueMessage(error instanceof ApiError && error.status === 401 ? 'Sign in to join competitive matchmaking.' : error instanceof Error ? error.message : 'Unable to join the queue')
    }
  }

  const stopQueue = async () => {
    if (queueTimer.current) clearInterval(queueTimer.current)
    queueTimer.current = null
    try {
      await cancelQueue()
      setQueueState('idle')
      setWaitSeconds(0)
      setQueueMessage('Search cancelled.')
    } catch (error) {
      setQueueState('error')
      setQueueMessage(error instanceof Error ? error.message : 'Unable to cancel the queue')
    }
  }

  // If explicit cohort ?player= is present, render the Research Cohort DNA view
  if (selectedId) {
    return <div className="page-wrap">
      <header className="page-header"><div><div className="eyebrow">RESEARCH COHORT</div><h1>AI Matchmaking</h1><p>Find players with similar measured Player DNA profiles.</p></div><span className="phase-badge"><span className="phase-dot" /> MOST SIMILAR</span></header>
      <section className="panel queue-panel">
        <div><div className="eyebrow">COMPETITIVE MATCH</div><h2>Play Now</h2><p>Automatic pairing uses competitive Elo, with the rating range expanding as you wait. DNA recommendations below are for the historical cohort only.</p></div>
        <div className="queue-actions">{queueState === 'waiting' ? <button className="secondary-action" onClick={() => void stopQueue()}>Cancel search</button> : <button className="primary-action" onClick={() => void startQueue()}>Play Now</button>}{queueMessage && <span className={queueState === 'error' ? 'form-error' : 'queue-message'} role="status">{queueMessage}{queueMessage.includes('Sign in') && <> <Link to="/account">Open account</Link></>}</span>}</div>
      </section>
      <section className="panel matchmaking-controls">
        <div className="matchmaking-search"><label htmlFor="player-search">Search players</label><input id="player-search" type="search" placeholder="Search by player ID" value={query} onChange={event => setQuery(event.target.value)} disabled={players === null || Boolean(playerError)} /></div>
        <div className="matchmaking-select"><label htmlFor="match-player">Player to match</label><select id="match-player" value={selectedId} onChange={event => choosePlayer(event.target.value)} disabled={players === null || Boolean(playerError)}><option value="">Select a player</option>{filteredPlayers.map(player => <option key={player.player_id} value={player.player_id}>{player.player_id}</option>)}</select></div>
        {players && <span className="matchmaking-count">{filteredPlayers.length} of {players.length} players</span>}
      </section>
      {playerError ? <section className="state-panel" role="alert"><h2>Players unavailable</h2><p>{playerError}</p></section>
        : players === null ? <section className="state-panel" aria-live="polite">Loading available players…</section>
        : players.length === 0 ? <section className="state-panel"><h2>No players available</h2><p>The player API returned an empty cohort.</p></section>
        : selectedId && !selectedPlayer ? <section className="state-panel" role="alert"><h2>Player selection is invalid</h2><p>“{selectedId}” is not in the available player list. Choose a listed player to request recommendations.</p><button className="secondary-action" onClick={() => choosePlayer('')}>Clear selection</button></section>
        : !selectedId ? <section className="state-panel"><h2>Select a player</h2><p>Choose a player to see the closest available Player DNA matches.</p></section>
        : recommendationError ? <section className="state-panel" role="alert"><h2>Recommendations unavailable</h2><p>{recommendationError}</p></section>
        : loading || !currentResult ? <section className="state-panel" aria-live="polite">Loading recommendations for {selectedId}…</section>
        : <RecommendationList response={currentResult} />}
    </div>
  }

  // Ordinary Player-facing Competitive Matchmaking Screen (No historical cohort search, No 403 error)
  const currentRating = user ? user.rating : 1200
  const gamesPlayed = user ? user.games_played : 0
  const isProvisional = gamesPlayed < 5
  const currentWindow = ratingWindow ?? 100
  const minRating = Math.max(100, currentRating - currentWindow)
  const maxRating = currentRating + currentWindow

  return (
    <div className="page-wrap competitive-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">RATED MULTIPLAYER</div>
          <h1>Competitive Matchmaking</h1>
          <p>
            Find an eligible human opponent near your rating. Authoritative Elo updates are applied upon game completion.
          </p>
        </div>
        <span className="phase-badge phase-badge--competitive">
          <span className="phase-dot" />
          {queueState === 'waiting' ? 'SEARCHING FOR MATCH' : 'RATED 10+10'}
        </span>
      </header>

      <div className="competitive-layout-grid">
        {/* Player Profile & Competitive Standing */}
        <section className="panel competitive-player-card" aria-label="Your competitive profile">
          <div className="eyebrow">YOUR COMPETITIVE RANK</div>
          <div className="player-rating-display">
            <div className="rating-badge-icon" aria-hidden="true">
              <IconTrophy size={28} />
            </div>
            <div>
              <strong className="competitive-rating-number text-lime">{currentRating}</strong>
              <span className="competitive-rating-label">
                {isProvisional ? `Provisional (${gamesPlayed}/5 games)` : 'Established Elo'}
              </span>
            </div>
          </div>

          <div className="competitive-stats-row">
            <div>
              <span className="comp-stat-label">Player</span>
              <strong className="comp-stat-val">{user ? user.username : 'Guest'}</strong>
            </div>
            <div>
              <span className="comp-stat-label">Matches</span>
              <strong className="comp-stat-val">{gamesPlayed}</strong>
            </div>
            <div>
              <span className="comp-stat-label">Record</span>
              <strong className="comp-stat-val">{user ? `${user.wins}W · ${user.losses}L · ${user.draws}D` : '—'}</strong>
            </div>
          </div>
        </section>

        {/* Live Matchmaking Queue Status & Actions */}
        <section className="panel competitive-queue-card" aria-label="Competitive queue controls">
          <div className="queue-status-header">
            <div>
              <div className="eyebrow">LIVE QUEUE</div>
              <h2>{queueState === 'waiting' ? 'Searching for Opponent…' : queueState === 'matched' ? 'Opponent Found!' : 'Ready to Play'}</h2>
            </div>
            {queueState === 'waiting' && (
              <span className="queue-timer-pill">
                {waitSeconds}s
              </span>
            )}
          </div>

          {queueState === 'idle' && (
            <div className="queue-idle-state">
              <p className="queue-description">
                Click below to enter the rated queue. You will be paired with a registered human player within ±100 Elo points. If no match is immediately found, the range expands gradually.
              </p>
              <div className="queue-action-row">
                {user ? (
                  <button
                    type="button"
                    className="primary-action btn-comp-play"
                    onClick={() => void startQueue()}
                  >
                    Find Match
                  </button>
                ) : (
                  <div className="guest-queue-notice">
                    <p>Competitive matchmaking requires an authenticated account.</p>
                    <Link to="/login" className="primary-action">Sign In to Play</Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {queueState === 'waiting' && (
            <div className="queue-searching-state">
              <div className="search-pulse-visual" aria-hidden="true">
                <div className="pulse-ring" />
                <div className="pulse-ring pulse-ring--delayed" />
                <div className="pulse-center-dot" />
              </div>

              <div className="search-range-info">
                <span className="range-label">Rating Window</span>
                <strong className="range-values">{minRating} – {maxRating} Elo (±{currentWindow})</strong>
                <small className="range-hint">The range expands by ±50 points every 10 seconds</small>
              </div>

              <div className="queue-action-row">
                <button
                  type="button"
                  className="secondary-action btn-cancel-queue"
                  onClick={() => void stopQueue()}
                >
                  Cancel Matchmaking
                </button>
              </div>
            </div>
          )}

          {queueState === 'matched' && (
            <div className="queue-matched-state">
              <div className="matched-banner">
                <p>Opponent found! Connecting to the game board…</p>
              </div>
            </div>
          )}

          {queueState === 'error' && (
            <div className="queue-error-state" role="alert">
              <p className="form-error">{queueMessage || 'Unable to join the queue.'}</p>
              <div className="queue-action-row">
                <button type="button" className="primary-action" onClick={() => void startQueue()}>
                  Try Again
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Competitive Rules & Match Standards */}
      <section className="panel competitive-rules-card" aria-label="Competitive match rules">
        <div className="eyebrow">OFFICIAL RULES</div>
        <h3>Rated Match Standards</h3>
        <div className="rules-grid">
          <div className="rule-item">
            <strong>Time Control</strong>
            <p>10 minutes per side with a 10-second increment per move.</p>
          </div>
          <div className="rule-item">
            <strong>Authoritative Moves</strong>
            <p>All legal moves and clock intervals are validated on the game server.</p>
          </div>
          <div className="rule-item">
            <strong>FIDE Elo Calculation</strong>
            <p>Ratings update authoritatively once upon game conclusion (K=32).</p>
          </div>
          <div className="rule-item">
            <strong>Post-Game Stockfish Analysis</strong>
            <p>Every rated match is automatically queued for engine accuracy review.</p>
          </div>
        </div>
      </section>
    </div>
  )
}

function RecommendationList({ response }: { response: MatchmakingResponse }) {
  const recommendations = response.recommendations
  return <section className="match-results" aria-label={`Recommendations for ${response.player_id}`}>
    <div className="match-results-heading"><div><div className="eyebrow">PLAYER DNA MATCHES</div><h2>Closest players to {response.player_id}</h2><p>Ranked by the backend’s {response.mode.replaceAll('_', ' ')} method. Lower Euclidean distance means closer DNA measurements.</p></div><span className="result-count">{recommendations.length} {recommendations.length === 1 ? 'match' : 'matches'}</span></div>
    {recommendations.length === 0 ? <div className="state-panel"><h2>No recommendations returned</h2><p>The service returned no opponents for this player.</p></div> : <div className="recommendation-grid">{recommendations.map(item => <article className="panel recommendation-card" key={`${item.rank}-${item.recommended_player_id}`}>
      <div className="recommendation-top"><span className="rank-chip">#{item.rank}</span><span className="match-signal" aria-hidden="true">●</span></div>
      <h3>{item.recommended_player_id}</h3>
      <div className="distance-stat"><span>DNA distance</span><strong>{item.score.toFixed(3)}</strong><small>{scoreLabel(item.score_type)}</small></div>
      <p className="recommendation-explanation">{item.explanation}</p>
      {item.feature_gaps.length > 0 && <div className="feature-gaps"><h4>Measurement comparison</h4>{item.feature_gaps.map(gap => <div className="feature-gap" key={gap.feature}><span>{formatFeature(gap.feature)}</span><span>{formatMetric(gap.query_value)} <i>→</i> {formatMetric(gap.candidate_value)}</span></div>)}</div>}
    </article>)}</div>}
    <p className="score-note">Distance and measurement comparisons are supplied by the matchmaking API. They describe DNA similarity, not a win prediction or compatibility percentage.</p>
  </section>
}

function scoreLabel(scoreType: string) {
  if (scoreType === 'euclidean_neighbor_distance_lower_is_better' || scoreType === 'euclidean_distance_lower_is_better') return 'Lower is a closer match'
  if (scoreType === 'cosine_similarity_higher_is_better') return 'Higher is a closer match'
  return scoreType.replaceAll('_', ' ')
}
function formatFeature(feature: string) { return feature.replace(/^dna_/, '').replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
function formatMetric(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(2) }
