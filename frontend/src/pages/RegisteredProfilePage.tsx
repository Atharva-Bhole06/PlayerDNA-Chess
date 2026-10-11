import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { getRegisteredDNAHistory, getRegisteredProfile } from '../api/client'
import type { LeaderboardEntry, LiveDNASnapshot } from '../api/types'

export function RegisteredProfilePage() {
  const { username = '' } = useParams()
  const [profile, setProfile] = useState<LeaderboardEntry | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dnaHistory, setDnaHistory] = useState<LiveDNASnapshot[] | null>(null)
  useEffect(() => {
    getRegisteredProfile(username).then(setProfile).catch(e => setError(e instanceof Error ? e.message : 'Unable to load profile'))
    getRegisteredDNAHistory(username).then(setDnaHistory).catch(() => setDnaHistory([]))
  }, [username])
  return <div className="page-wrap"><header className="page-header"><div><div className="eyebrow">REGISTERED PLAYER</div><h1>Player profile</h1><p>Verified platform results from completed multiplayer games.</p></div></header>
    {error ? <section className="state-panel" role="alert"><h2>Profile unavailable</h2><p>{error}</p></section> : !profile ? <section className="state-panel" aria-live="polite">Loading profile…</section> : <>
      <section className="panel registered-profile"><div className="account-avatar" aria-hidden="true">{profile.username.slice(0, 1).toUpperCase()}</div><div><h2>{profile.username}</h2><p>Competitive rating · {profile.rating}</p></div></section>
      <section className="panel style-cluster"><strong>Measured style group</strong><span>{profile.style_cluster === null || profile.style_cluster === undefined ? 'Unavailable until a model and enough analyzed games exist.' : `Cluster ${profile.style_cluster} · experimental`}</span>{profile.style_model_version && <small>Model: {profile.style_model_version}</small>}</section>
      <div className="metric-grid"><Metric label="Games" value={profile.games_played} /><Metric label="Wins" value={profile.wins} /><Metric label="Draws" value={profile.draws} /><Metric label="Losses" value={profile.losses} /><Metric label="Win rate" value={profile.win_rate === null ? '—' : `${(profile.win_rate * 100).toFixed(1)}%`} /></div>
      <section className="panel dna-history-panel"><h2>Player DNA history</h2><p>Snapshots use engine-evaluated moves from completed platform games; lower CPL means fewer estimated move-quality losses.</p>{dnaHistory === null ? <div className="empty-state">Loading DNA history…</div> : dnaHistory.length === 0 ? <div className="empty-state">No analyzed games yet. DNA measurements appear after a completed game has been analyzed.</div> : <div className="leaderboard-wrap"><table className="leaderboard-table"><thead><tr><th>Snapshot</th><th>Games analyzed</th><th>Median CPL</th><th>CPL spread</th><th>Inaccuracies / 100</th><th>Feature version</th></tr></thead><tbody>{dnaHistory.map(row => <tr key={row.game_id}><td>{new Date(row.snapshot_at).toLocaleDateString()}</td><td>{row.games_analyzed}</td><td>{row.median_cpl.toFixed(1)}</td><td>{row.cpl_std.toFixed(1)}</td><td>{row.inaccuracies_per_100_cp_moves.toFixed(1)}</td><td>{row.feature_version}</td></tr>)}</tbody></table></div>}</section>
    </>}
    <Link to="/">Back to Overview</Link>
  </div>
}

function Metric({ label, value }: { label: string; value: string | number }) { return <section className="panel metric-card"><span>{label}</span><strong>{value}</strong></section> }
