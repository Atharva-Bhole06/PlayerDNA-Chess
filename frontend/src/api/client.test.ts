import { afterEach, describe, expect, it, vi } from 'vitest'
import { getChessRecommendation, getHealth, getMatchmaking, getPlayer, getPlayers } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('health API client', () => {
  it('requests the health endpoint and returns the verified response shape', async () => {
    const health = { status: 'ok', database_available: true, stockfish_available: true }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(health), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getHealth()).resolves.toEqual(health)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/health', expect.objectContaining({ method: 'GET' }))
  })

  it('rejects an incompatible response instead of inventing service status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200 })))
    await expect(getHealth()).rejects.toThrow('Health response did not match the expected schema')
  })
})

describe('player API client', () => {
  const summary = { player_id: 'Ada', games_analyzed: 12, mean_player_rating: 1800, win_rate_pct: 50 }
  it('loads verified player summaries and profiles', async () => {
    const profile = { ...summary, record: { wins: 6, draws: 2, losses: 4 }, performance: { mean_accuracy_pct: 91, median_cpl: 18 }, player_dna: { median_cpl: 18, cpl_std: null, inaccuracies_per_100_cp_moves: 4, version: 'v1' } }
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify([summary]), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(profile), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getPlayers()).resolves.toEqual([summary])
    await expect(getPlayer('Ada')).resolves.toEqual(profile)
    expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8000/api/players/Ada')
  })
  it('rejects invalid data and reports HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[]', { status: 503 })))
    await expect(getPlayers()).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('[{"player_id":"x"}]', { status: 200 })))
    await expect(getPlayers()).rejects.toThrow('expected schema')
  })
})

describe('matchmaking API client', () => {
  it('requests and validates the matchmaking response shape, including feature gaps', async () => {
    const body = { player_id: 'Ada', mode: 'most_similar', recommendations: [{ recommended_player_id: 'Mira', rank: 1, score: 0.25, score_type: 'euclidean_neighbor_distance_lower_is_better', explanation: 'similar profile', feature_gaps: [{ feature: 'dna_median_cpl', query_value: 12, candidate_value: 13, raw_gap: 1, normalized_gap: 0.1 }] }] }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getMatchmaking('Ada')).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/matchmaking/Ada', expect.objectContaining({ method: 'GET' }))
  })
  it('rejects HTTP failures and malformed optional comparison values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })))
    await expect(getMatchmaking('Ada')).rejects.toThrow('HTTP 503')
    const invalid = { player_id: 'Ada', mode: 'most_similar', recommendations: [{ recommended_player_id: 'Mira', rank: 1, score: 1, score_type: 'distance', explanation: '', feature_gaps: [{ feature: 'x', query_value: null, candidate_value: 1, raw_gap: 1, normalized_gap: 1 }] }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(invalid), { status: 200 })))
    await expect(getMatchmaking('Ada')).rejects.toThrow('expected schema')
  })
})

describe('chess analysis API client', () => {
  const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
  const active = { fen, best_move: 'e2e4', best_move_san: 'e4', evaluation: 0.42, evaluation_mate: null, evaluation_type: 'cp', principal_variation: ['e4', 'e5'], depth: 12, analysis_time_ms: 203.5, terminal_reason: null }
  it('posts only the FEN and accepts the verified analysis response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(active), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(getChessRecommendation(fen)).resolves.toEqual(active)
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chess/recommend', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen }), headers: expect.objectContaining({ 'Content-Type': 'application/json' }) }))
  })
  it('handles a terminal response with nullable engine values and rejects HTTP or schema errors', async () => {
    const terminal = { fen, best_move: null, best_move_san: null, evaluation: null, evaluation_mate: null, evaluation_type: 'terminal', principal_variation: [], depth: null, analysis_time_ms: 0, terminal_reason: 'checkmate' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(terminal), { status: 200 })))
    await expect(getChessRecommendation(fen)).resolves.toEqual(terminal)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })))
    await expect(getChessRecommendation(fen)).rejects.toThrow('HTTP 503')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ ...active, evaluation: '0.4' }), { status: 200 })))
    await expect(getChessRecommendation(fen)).rejects.toThrow('expected schema')
  })
})
