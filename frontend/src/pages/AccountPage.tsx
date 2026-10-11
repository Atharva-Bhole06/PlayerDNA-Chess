import { useEffect, useState, type FormEvent } from 'react'
import { authenticate, getCurrentUser, logout } from '../api/client'
import { Link } from 'react-router'
import type { AuthenticatedProfile } from '../api/types'

export function AccountPage() {
  const [profile, setProfile] = useState<AuthenticatedProfile | null>(null)
  const [registerMode, setRegisterMode] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => { getCurrentUser().then(setProfile).catch(e => setError(e.message)).finally(() => setLoading(false)) }, [])
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(null)
    try { setProfile(await authenticate(registerMode ? 'register' : 'login', username, password)); setPassword('') }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to authenticate') }
  }
  async function signOut() {
    try { await logout(); setProfile(null) }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign out') }
  }
  return <div className="page-wrap">
    <header className="page-header"><div><div className="eyebrow">PLAYER ACCOUNT</div><h1>Account</h1><p>Registered platform profile and competitive identity.</p></div><span className="phase-badge"><span className="phase-dot" /> SECURE SESSION</span></header>
    {loading ? <section className="state-panel" aria-live="polite">Loading account…</section> : profile ? <section className="panel account-panel">
      <div className="account-avatar" aria-hidden="true">{profile.username.slice(0, 1).toUpperCase()}</div><div className="account-main"><h2>{profile.username}</h2><p>Competitive rating · {profile.rating}</p></div>
      <button className="secondary-action" onClick={signOut}>Sign out</button>
      <div className="account-stats"><Metric label="Games" value={profile.games_played} /><Metric label="Wins" value={profile.wins} /><Metric label="Draws" value={profile.draws} /><Metric label="Losses" value={profile.losses} /></div>
      <Link className="account-profile-link" to={`/profiles/${encodeURIComponent(profile.username)}`}>View public profile and Player DNA history →</Link>
      <p className="account-note">Player DNA status: {profile.player_dna_status.replaceAll('_', ' ')}. Features update after verified games finish engine analysis.</p>
    </section> : <section className="panel account-panel account-form-panel">
      <h2>{registerMode ? 'Create your account' : 'Welcome back'}</h2><p>{registerMode ? 'Create a profile for competitive multiplayer chess.' : 'Sign in to your PlayerDNA account.'}</p>
      <form className="account-form" onSubmit={submit}>
        <label>Username<input autoComplete="username" minLength={3} maxLength={32} pattern="[A-Za-z0-9_.-]+" required value={username} onChange={e => setUsername(e.target.value)} /></label>
        <label>Password<input autoComplete={registerMode ? 'new-password' : 'current-password'} type="password" minLength={10} maxLength={128} required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action" type="submit">{registerMode ? 'Create account' : 'Sign in'}</button>
      </form>
      <button className="text-button account-switch" onClick={() => { setRegisterMode(!registerMode); setError(null) }}>{registerMode ? 'Already registered? Sign in' : 'New to PlayerDNA? Create an account'}</button>
      <small>Passwords must be at least 10 characters. Historical dataset players are not platform accounts.</small>
    </section>}
    {!loading && error && profile && <p className="form-error" role="alert">{error}</p>}
  </div>
}

function Metric({ label, value }: { label: string; value: number }) { return <div><span>{label}</span><strong>{value}</strong></div> }
