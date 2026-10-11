import type { AuthenticatedProfile, ChessRecommendationResponse, HealthResponse, LeaderboardEntry, LiveDNASnapshot, MatchmakingFeatureGap, MatchmakingResponse, MultiplayerGameState, PerformanceReport, PlayerProfile, PlayerSummary, QueueStatus, RecentGame } from './types'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const defaultBaseUrl = import.meta.env.DEV ? 'http://localhost:8000' : ''
export const API_BASE_URL = (configuredBaseUrl || defaultBaseUrl).replace(/\/+$/, '')

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { method: 'GET', headers: { Accept: 'application/json' }, credentials: 'include', signal })
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API')
  }
  if (!response.ok) throw new ApiError(`Request failed with HTTP ${response.status}`, response.status)
  return response.json()
}

const nullableNumber = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value)
function isPlayerSummary(value: unknown): value is PlayerSummary {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.player_id === 'string' && nullableNumber(row.games_analyzed) && nullableNumber(row.mean_player_rating) && nullableNumber(row.win_rate_pct)
}

export async function getPlayers(signal?: AbortSignal): Promise<PlayerSummary[]> {
  const body = await getJson('/api/players', signal)
  if (!Array.isArray(body) || !body.every(isPlayerSummary)) throw new ApiError('Players response did not match the expected schema')
  return body
}

function isFeatureGap(value: unknown): value is MatchmakingFeatureGap {
  if (typeof value !== 'object' || value === null) return false
  const gap = value as Record<string, unknown>
  return typeof gap.feature === 'string' && ['query_value', 'candidate_value', 'raw_gap', 'normalized_gap'].every(key => typeof gap[key] === 'number' && Number.isFinite(gap[key]))
}

export async function getMatchmaking(playerId: string, signal?: AbortSignal): Promise<MatchmakingResponse> {
  const body = await getJson(`/api/matchmaking/${encodeURIComponent(playerId)}`, signal)
  if (typeof body !== 'object' || body === null) throw new ApiError('Matchmaking response did not match the expected schema')
  const result = body as Record<string, unknown>
  if (result.player_id !== playerId || result.mode !== 'most_similar' || !Array.isArray(result.recommendations) ||
      !result.recommendations.every(item => {
        if (typeof item !== 'object' || item === null) return false
        const recommendation = item as Record<string, unknown>
        return typeof recommendation.recommended_player_id === 'string' && Number.isInteger(recommendation.rank) &&
          typeof recommendation.score === 'number' && Number.isFinite(recommendation.score) &&
          typeof recommendation.score_type === 'string' && typeof recommendation.explanation === 'string' &&
          Array.isArray(recommendation.feature_gaps) && recommendation.feature_gaps.every(isFeatureGap)
      })) {
    throw new ApiError('Matchmaking response did not match the expected schema')
  }
  return body as MatchmakingResponse
}

export async function getChessRecommendation(fen: string, signal?: AbortSignal): Promise<ChessRecommendationResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/chess/recommend`, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen }), signal,
    })
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API')
  }
  if (!response.ok) throw new ApiError(`Chess analysis failed with HTTP ${response.status}`, response.status)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) throw new ApiError('Chess response did not match the expected schema')
  const result = body as Record<string, unknown>
  const nullableString = (value: unknown) => value === null || typeof value === 'string'
  if (typeof result.fen !== 'string' || !nullableString(result.best_move) || !nullableString(result.best_move_san) ||
      !nullableNumber(result.evaluation) || !nullableNumber(result.evaluation_mate) ||
      !['cp', 'mate', 'terminal'].includes(String(result.evaluation_type)) ||
      !Array.isArray(result.principal_variation) || !result.principal_variation.every(move => typeof move === 'string') ||
      !nullableNumber(result.depth) || typeof result.analysis_time_ms !== 'number' || !Number.isFinite(result.analysis_time_ms) ||
      !nullableString(result.terminal_reason)) {
    throw new ApiError('Chess response did not match the expected schema')
  }
  return body as ChessRecommendationResponse
}

export async function getPlayer(playerId: string): Promise<PlayerProfile> {
  const body = await getJson(`/api/players/${encodeURIComponent(playerId)}`)
  if (typeof body !== 'object' || body === null || !isPlayerSummary(body)) throw new ApiError('Player profile response did not match the expected schema')
  const profile = body as unknown as Record<string, unknown>
  const record = profile.record
  const performance = profile.performance
  const dna = profile.player_dna
  if (typeof record !== 'object' || record === null || typeof performance !== 'object' || performance === null ||
      !['wins', 'draws', 'losses'].every(key => nullableNumber((record as Record<string, unknown>)[key])) ||
      !Object.values(performance).every(nullableNumber) ||
      (dna !== null && (typeof dna !== 'object' || dna === null || typeof (dna as Record<string, unknown>).version !== 'string' ||
        !['median_cpl', 'cpl_std', 'inaccuracies_per_100_cp_moves'].every(key => nullableNumber((dna as Record<string, unknown>)[key]))))) {
    throw new ApiError('Player profile response did not match the expected schema')
  }
  return body as PlayerProfile
}

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API')
  }

  if (!response.ok) {
    throw new ApiError(`Health request failed with HTTP ${response.status}`, response.status)
  }

  const body: unknown = await response.json()
  if (
    typeof body !== 'object' || body === null ||
    typeof (body as HealthResponse).status !== 'string' ||
    typeof (body as HealthResponse).database_available !== 'boolean' ||
    typeof (body as HealthResponse).stockfish_available !== 'boolean'
  ) {
    throw new ApiError('Health response did not match the expected schema')
  }

  return body as HealthResponse
}

export async function getCurrentUser(): Promise<AuthenticatedProfile | null> {
  let response: Response
  try { response = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include', headers: { Accept: 'application/json' } }) }
  catch (error) { throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API') }
  if (response.status === 401) return null
  if (!response.ok) throw new ApiError(`Request failed with HTTP ${response.status}`, response.status)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) throw new ApiError('Account response did not match the expected schema')
  const row = body as Record<string, unknown>
  if (typeof row.username !== 'string' || !Number.isInteger(row.rating) ||
      !['games_played', 'wins', 'losses', 'draws'].every(key => Number.isInteger(row[key])) ||
      typeof row.player_dna_status !== 'string') throw new ApiError('Account response did not match the expected schema')
  return body as AuthenticatedProfile
}

export async function authenticate(path: 'register' | 'login', username: string, password: string): Promise<AuthenticatedProfile> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/${path}`, { method: 'POST', credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  } catch (error) { throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API') }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: unknown } | null
    throw new ApiError(typeof body?.detail === 'string' ? body.detail : `Request failed with HTTP ${response.status}`, response.status)
  }
  return response.json() as Promise<AuthenticatedProfile>
}

export async function logout(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
  if (!response.ok) throw new ApiError(`Logout failed with HTTP ${response.status}`, response.status)
}

async function queueRequest(method: 'POST' | 'GET' | 'DELETE'): Promise<QueueStatus> {
  const response = await fetch(`${API_BASE_URL}/api/matchmaking/queue`, { method, credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Matchmaking queue request failed with HTTP ${response.status}`, response.status)
  return response.json() as Promise<QueueStatus>
}
export const joinQueue = () => queueRequest('POST')
export const getQueueStatus = () => queueRequest('GET')
export const cancelQueue = () => queueRequest('DELETE')

export async function getMultiplayerGame(gameId: string): Promise<MultiplayerGameState> {
  const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Game request failed with HTTP ${response.status}`, response.status)
  return response.json() as Promise<MultiplayerGameState>
}

export function openGameSocket(gameId: string): WebSocket {
  const base = API_BASE_URL || window.location.origin
  const url = new URL(`/api/games/${encodeURIComponent(gameId)}/ws`, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(url)
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  const body = await getJson('/api/leaderboard')
  if (!Array.isArray(body) || !body.every(item => {
    if (typeof item !== 'object' || item === null) return false
    const row = item as Record<string, unknown>
    return Number.isInteger(row.rank) && typeof row.username === 'string' && Number.isInteger(row.rating) &&
      ['games_played', 'wins', 'losses', 'draws'].every(key => Number.isInteger(row[key])) &&
      (row.win_rate === null || typeof row.win_rate === 'number' && Number.isFinite(row.win_rate))
  })) throw new ApiError('Leaderboard response did not match the expected schema')
  return body as LeaderboardEntry[]
}

export async function getRegisteredProfile(username: string): Promise<LeaderboardEntry> {
  const body = await getJson(`/api/profiles/${encodeURIComponent(username)}`)
  if (typeof body !== 'object' || body === null) throw new ApiError('Profile response did not match the expected schema')
  const row = body as Record<string, unknown>
  if (typeof row.username !== 'string' || !Number.isInteger(row.rating) ||
      !['games_played', 'wins', 'losses', 'draws'].every(key => Number.isInteger(row[key])) ||
      (row.win_rate !== null && (typeof row.win_rate !== 'number' || !Number.isFinite(row.win_rate)))) {
    throw new ApiError('Profile response did not match the expected schema')
  }
  return { rank: 0, username: row.username, rating: row.rating as number,
    games_played: row.games_played as number, wins: row.wins as number, losses: row.losses as number,
    draws: row.draws as number, win_rate: row.win_rate as number | null,
    style_cluster: typeof row.style_cluster === 'number' ? row.style_cluster : null,
    style_model_version: typeof row.style_model_version === 'string' ? row.style_model_version : null }
}

export async function getRegisteredDNAHistory(username: string): Promise<LiveDNASnapshot[]> {
  const body = await getJson(`/api/profiles/${encodeURIComponent(username)}/dna`)
  if (!Array.isArray(body) || !body.every(item => {
    if (typeof item !== 'object' || item === null) return false
    const row = item as Record<string, unknown>
    return typeof row.game_id === 'string' && Number.isInteger(row.games_analyzed) &&
      ['median_cpl', 'cpl_std', 'inaccuracies_per_100_cp_moves'].every(key => typeof row[key] === 'number' && Number.isFinite(row[key])) &&
      typeof row.feature_version === 'string' && typeof row.snapshot_at === 'string'
  })) throw new ApiError('DNA history response did not match the expected schema')
  return body as LiveDNASnapshot[]
}

export async function getRecentGames(): Promise<RecentGame[]> {
  const body = await getJson('/api/account/games')
  if (!Array.isArray(body)) throw new ApiError('Recent games response did not match the expected schema')
  return body as RecentGame[]
}

export async function getPerformanceReport(gameId: string): Promise<PerformanceReport> {
  const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}/report`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Game report request failed with HTTP ${response.status}`, response.status)
  return response.json() as Promise<PerformanceReport>
}
