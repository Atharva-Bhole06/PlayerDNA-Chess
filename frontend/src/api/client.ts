import type { AIExperiment, AIExperimentPreset, AuthenticatedProfile, ChessRecommendationResponse, HealthResponse, LeaderboardEntry, LiveDNASnapshot, MatchmakingFeatureGap, MatchmakingResponse, MLStatusResponse, MultiplayerGameState, PerformanceReport, PlayerProfile, PlayerSummary, QueueStatus, RecentGame } from './types'

function getApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      return `http://${window.location.hostname}:8000`
    }
    return 'http://127.0.0.1:8000'
  }
  return ''
}
export const API_BASE_URL = getApiBaseUrl()

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

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthenticatedProfile | null> {
  let response: Response
  try {
    let activeSignal = signal
    let timer: ReturnType<typeof setTimeout> | undefined
    if (!activeSignal && typeof AbortController !== 'undefined') {
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), 8000)
      activeSignal = controller.signal
    }
    try {
      response = await fetch(`${API_BASE_URL}/api/auth/me`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: activeSignal,
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
  } catch (error) {
    throw new ApiError(error instanceof Error ? error.message : 'Unable to reach the API')
  }
  if (response.status === 401) return null
  if (!response.ok) throw new ApiError(`Request failed with HTTP ${response.status}`, response.status)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) throw new ApiError('Account response did not match the expected schema')
  const row = body as Record<string, unknown>
  if (typeof row.username !== 'string' || !Number.isInteger(row.rating) ||
      !['games_played', 'wins', 'losses', 'draws'].every(key => Number.isInteger(row[key])) ||
      typeof row.player_dna_status !== 'string') throw new ApiError('Account response did not match the expected schema')
  return {
    ...(body as AuthenticatedProfile),
    is_admin: typeof row.is_admin === 'boolean' ? row.is_admin : false,
  }
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

async function queueRequest(method: 'POST' | 'GET' | 'DELETE', mode?: 'competitive' | 'casual'): Promise<QueueStatus> {
  const url = mode && method === 'POST' ? `${API_BASE_URL}/api/matchmaking/queue?mode=${encodeURIComponent(mode)}` : `${API_BASE_URL}/api/matchmaking/queue`
  const response = await fetch(url, { method, credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Matchmaking queue request failed with HTTP ${response.status}`, response.status)
  return response.json() as Promise<QueueStatus>
}
export const joinQueue = (mode?: 'competitive' | 'casual') => queueRequest('POST', mode)
export const getQueueStatus = () => queueRequest('GET')
export const cancelQueue = () => queueRequest('DELETE')

export async function getMultiplayerGame(gameId: string): Promise<MultiplayerGameState> {
  const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}`, { credentials: 'include', headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiError(`Game request failed with HTTP ${response.status}`, response.status)
  const body: unknown = await response.json()
  if (typeof body !== 'object' || body === null) {
    throw new ApiError('Game response did not match the expected schema')
  }
  const row = body as Record<string, unknown>
  if (
    typeof row.game_id !== 'string' ||
    (row.status !== 'active' && row.status !== 'completed') ||
    (row.color !== 'white' && row.color !== 'black') ||
    typeof row.white_username !== 'string' ||
    typeof row.black_username !== 'string' ||
    typeof row.fen !== 'string'
  ) {
    throw new ApiError('Game response did not match the expected schema')
  }
  return body as MultiplayerGameState
}

export function openGameSocket(gameId: string): WebSocket {
  const base = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:8000')
  const url = new URL(`/api/games/${encodeURIComponent(gameId)}/ws`, base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return new WebSocket(url.toString())
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

export async function triggerGameAnalysis(gameId: string): Promise<PerformanceReport> {
  const response = await fetch(`${API_BASE_URL}/api/games/${encodeURIComponent(gameId)}/analyze`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) throw new ApiError(`Trigger analysis failed with HTTP ${response.status}`, response.status)
  return response.json() as Promise<PerformanceReport>
}


export async function getEnginePresets(signal?: AbortSignal): Promise<Record<string, AIExperimentPreset>> {
  const body = await getJson('/api/research/engine-presets', signal)
  return body as Record<string, AIExperimentPreset>
}

export async function getExperiments(signal?: AbortSignal): Promise<AIExperiment[]> {
  const body = await getJson('/api/research/experiments', signal)
  if (!Array.isArray(body)) throw new ApiError('Experiments response did not match the expected schema')
  return body as AIExperiment[]
}

export async function createExperiment(data: { name?: string; white_preset: string; black_preset: string }): Promise<AIExperiment> {
  const response = await fetch(`${API_BASE_URL}/api/research/experiments`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(typeof errorBody?.detail === 'string' ? errorBody.detail : `Experiment failed with HTTP ${response.status}`, response.status)
  }
  return response.json() as Promise<AIExperiment>
}

export async function getExperiment(id: string, signal?: AbortSignal): Promise<AIExperiment> {
  const body = await getJson(`/api/research/experiments/${encodeURIComponent(id)}`, signal)
  return body as AIExperiment
}

export async function cancelExperiment(id: string): Promise<AIExperiment> {
  const response = await fetch(`${API_BASE_URL}/api/research/experiments/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as { detail?: string } | null
    throw new ApiError(typeof errorBody?.detail === 'string' ? errorBody.detail : `Cancel failed with HTTP ${response.status}`, response.status)
  }
  return response.json() as Promise<AIExperiment>
}

export async function getMLStatus(signal?: AbortSignal): Promise<MLStatusResponse> {
  const body = await getJson('/api/research/ml/status', signal)
  return body as MLStatusResponse
}
