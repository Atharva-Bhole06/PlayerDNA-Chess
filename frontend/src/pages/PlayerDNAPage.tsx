import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { getPlayer, getPlayers } from '../api/client'
import type { PlayerProfile, PlayerSummary } from '../api/types'

export function PlayerDNAPage() {
  const [params, setParams] = useSearchParams()
  const [players, setPlayers] = useState<PlayerSummary[] | null>(null)
  const [profile, setProfile] = useState<PlayerProfile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const SESSION_KEY = 'playerdna_last_selected_player'
  const selected = params.get('player') ?? ''

  useEffect(() => {
    let cancelled = false
    getPlayers().then(rows => {
      if (cancelled) return
      setPlayers(rows)
      if (!selected && rows.length) {
        let fallback = rows[0].player_id
        try {
          const cached = sessionStorage.getItem(SESSION_KEY)
          if (cached && rows.some(r => r.player_id === cached)) {
            fallback = cached
          }
        } catch {
          // ignore storage error
        }
        setParams({ player: fallback }, { replace: true })
      }
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load players')
    })
    return () => { cancelled = true }
  }, [selected, setParams])

  useEffect(() => {
    if (selected) {
      try {
        sessionStorage.setItem(SESSION_KEY, selected)
      } catch {
        // ignore storage error
      }
    }
  }, [selected])

  useEffect(() => {
    if (!selected) {
      setProfile(null)
      return
    }
    let cancelled = false
    setProfile(null)
    setError(null)
    getPlayer(selected).then(p => {
      if (!cancelled) setProfile(p)
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load profile')
    })
    return () => { cancelled = true }
  }, [selected])
  const player = players?.find(row => row.player_id === selected)
  return <div className="page-wrap">
    <header className="page-header"><div><div className="eyebrow">PLAYER INTELLIGENCE</div><h1>Player DNA</h1><p>Explore observed performance statistics and raw chess performance measurements.</p></div><span className="phase-badge"><span className="phase-dot" /> PROFILE ANALYSIS</span></header>
    <section className="panel selector-panel"><label htmlFor="player-select">Select player</label><select id="player-select" value={selected} onChange={e => setParams(e.target.value ? { player: e.target.value } : {})}><option value="">Choose a player</option>{players?.map(p => <option key={p.player_id} value={p.player_id}>{p.player_id}</option>)}</select>{players && <small>{players.length} players available</small>}</section>
    {error ? <section className="state-panel" role="alert"><h2>Profile unavailable</h2><p>{error}</p></section> : players === null ? <section className="state-panel" aria-live="polite">Loading players…</section> : players.length === 0 ? <section className="state-panel"><h2>No players available</h2><p>The API returned an empty player list.</p></section> : !selected ? <section className="state-panel">Choose a player to view their profile.</section> : !profile ? <section className="state-panel" aria-live="polite">Loading {selected}…</section> : <>
      <section className="panel profile-summary"><div><span className="eyebrow">PLAYER PROFILE</span><h2>{profile.player_id}</h2></div><Summary label="Games analyzed" value={profile.games_analyzed} /><Summary label="Mean rating" value={profile.mean_player_rating} /><Summary label="Win rate" value={profile.win_rate_pct} suffix="%" /></section>
      <div className="dna-grid">{[
        ['median_cpl', 'Median centipawn loss', 'Typical centipawn loss per analyzed move. Lower values indicate closer play to the engine’s top choice.'],
        ['cpl_std', 'Centipawn loss variation', 'Standard deviation of centipawn loss. Describes how much move quality varies.'],
        ['inaccuracies_per_100_cp_moves', 'Inaccuracies per 100 moves', 'Observed inaccuracies per 100 centipawn-scored moves. Lower values mean fewer inaccuracies.'],
      ].map(([key, title, description]) => <DNAChart key={key} title={title} description={description} value={profile.player_dna?.[key as keyof NonNullable<PlayerProfile['player_dna']>] as number | null | undefined} />)}</div>
      <section className="panel performance-panel"><h2>Performance statistics</h2><p>Values are returned directly by the player profile API.</p><div className="stats-grid">{Object.entries(profile.performance).map(([key, value]) => <div key={key}><span>{formatLabel(key)}</span><strong>{formatValue(value)}</strong></div>)}</div><h3>Record</h3><div className="record-grid"><Summary label="Wins" value={profile.record.wins} /><Summary label="Draws" value={profile.record.draws} /><Summary label="Losses" value={profile.record.losses} /></div></section>
    </>}
    {player && !error && <span className="sr-only">Selected {player.player_id}</span>}
  </div>
}
function Summary({ label, value, suffix = '' }: { label: string; value: number | null; suffix?: string }) { return <div className="summary-stat"><span>{label}</span><strong>{value === null ? 'Unavailable' : `${value}${suffix}`}</strong></div> }
function DNAChart({ title, description, value }: { title: string; description: string; value: number | null | undefined }) { return <section className="panel dna-card"><h2>{title}</h2><p>{description}</p>{value == null ? <div className="chart-empty">Measurement unavailable</div> : <div className="chart-value"><strong>{value.toFixed(2)}</strong><div className="measurement-glyph" aria-hidden="true"><i /><i /><i /><i /><i /></div><small>Raw API measurement · no transformed score</small></div>}</section> }
function formatLabel(key: string) { return key.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) }
function formatValue(value: number | null) { return value === null ? 'Unavailable' : Number.isInteger(value) ? String(value) : value.toFixed(2) }
