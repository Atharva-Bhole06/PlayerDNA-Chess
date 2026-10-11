import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError, cancelQueue, getMatchmaking, getPlayers, getQueueStatus, joinQueue } from '../api/client'
import type { MatchmakingResponse, PlayerSummary } from '../api/types'

export function MatchmakingPage() {
  const navigate = useNavigate()
  const queueTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [queueState, setQueueState] = useState<'idle' | 'waiting' | 'error'>('idle')
  const [queueMessage, setQueueMessage] = useState('')
  useEffect(() => () => { if (queueTimer.current) clearInterval(queueTimer.current) }, [])
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('player') ?? ''
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null)
  const [playerError, setPlayerError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<MatchmakingResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [recommendationError, setRecommendationError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getPlayers(controller.signal).then(setPlayers).catch(error => {
      if (!controller.signal.aborted) setPlayerError(error instanceof Error ? error.message : 'Unable to load players')
    })
    return () => controller.abort()
  }, [])

  const selectedPlayer = players?.find(player => player.player_id === selectedId)
  useEffect(() => {
    setResult(null)
    setRecommendationError(null)
    if (!selectedId || !selectedPlayer) { setLoading(false); return }
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

  const handleQueueState = (queue: Awaited<ReturnType<typeof getQueueStatus>>) => {
    if (queue.status === 'matched' && queue.game_id) {
      if (queueTimer.current) clearInterval(queueTimer.current)
      queueTimer.current = null
      navigate(`/live-chess?game=${encodeURIComponent(queue.game_id)}`)
    } else if (queue.status === 'waiting') {
      setQueueState('waiting')
      setQueueMessage(`Searching for a close Elo opponent · ${queue.wait_seconds}s · ±${queue.rating_window ?? '—'} rating`)
    }
  }
  const startQueue = async () => {
    setQueueMessage('')
    try {
      const initial = await joinQueue()
      handleQueueState(initial)
      if (initial.status === 'waiting' && !queueTimer.current) queueTimer.current = setInterval(() => {
        getQueueStatus().then(handleQueueState).catch(error => { setQueueState('error'); setQueueMessage(error instanceof Error ? error.message : 'Queue status unavailable') })
      }, 2000)
    } catch (error) {
      setQueueState('error')
      setQueueMessage(error instanceof ApiError && error.status === 401 ? 'Sign in to join competitive matchmaking.' : error instanceof Error ? error.message : 'Unable to join the queue')
    }
  }
  const stopQueue = async () => {
    if (queueTimer.current) clearInterval(queueTimer.current)
    queueTimer.current = null
    try { await cancelQueue(); setQueueState('idle'); setQueueMessage('Search cancelled.') }
    catch (error) { setQueueState('error'); setQueueMessage(error instanceof Error ? error.message : 'Unable to cancel the queue') }
  }

  return <div className="page-wrap">
    <header className="page-header"><div><div className="eyebrow">SMART PAIRINGS</div><h1>AI Matchmaking</h1><p>Find players with similar measured Player DNA profiles.</p></div><span className="phase-badge"><span className="phase-dot" /> MOST SIMILAR</span></header>
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
