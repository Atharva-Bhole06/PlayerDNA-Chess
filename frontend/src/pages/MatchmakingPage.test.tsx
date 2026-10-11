import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MatchmakingPage } from './MatchmakingPage'

const players = ['Ada', 'Mira', 'Tania'].map(player_id => ({ player_id, games_analyzed: null, mean_player_rating: null, win_rate_pct: null }))
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }) }
function matchmaking(player_id: string, recommendations: unknown[] = [{ recommended_player_id: 'Mira', rank: 1, score: 0.2381, score_type: 'euclidean_neighbor_distance_lower_is_better', explanation: 'dna_median_cpl 12.00 vs 13.00 (DNA gap 0.100)', feature_gaps: [{ feature: 'dna_median_cpl', query_value: 12, candidate_value: 13, raw_gap: 1, normalized_gap: 0.1 }] }]) { return { player_id, mode: 'most_similar', recommendations } }
function renderPage(path = '/matchmaking') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/matchmaking" element={<MatchmakingPage />} /></Routes></MemoryRouter>) }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Matchmaking page', () => {
  it('loads and renders backend recommendations and DNA comparisons', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.endsWith('/api/players') ? response(players) : response(matchmaking('Ada'))))
    renderPage('/matchmaking?player=Ada')
    expect(await screen.findByRole('heading', { name: 'Closest players to Ada' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mira' })).toBeInTheDocument()
    expect(screen.getByText('0.238')).toBeInTheDocument()
    expect(screen.getByText(/Lower is a closer match/)).toBeInTheDocument()
    expect(screen.getByText((_, element) => element?.textContent === '12 → 13')).toBeInTheDocument()
  })

  it('shows the loading state while recommendations are pending', async () => {
    let resolveRecommendation!: (value: Response) => void
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.endsWith('/api/players') ? Promise.resolve(response(players)) : new Promise<Response>(resolve => { resolveRecommendation = resolve })))
    renderPage('/matchmaking?player=Ada')
    expect(await screen.findByText('Loading recommendations for Ada…')).toBeInTheDocument()
    await act(async () => resolveRecommendation(response(matchmaking('Ada'))))
    expect(await screen.findByRole('heading', { name: 'Mira' })).toBeInTheDocument()
  })

  it('handles no recommendations and nullable summary values in player list', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => url.endsWith('/api/players') ? response(players) : response(matchmaking('Ada', [])))
    vi.stubGlobal('fetch', fetchMock)
    renderPage('/matchmaking?player=Ada')
    expect(await screen.findByRole('heading', { name: 'No recommendations returned' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Ada' })).toBeInTheDocument()
  })

  it('shows API errors and rejects a player ID absent from available players', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.endsWith('/api/players') ? response(players) : response({ detail: 'Player not found' }, 404)))
    const { unmount } = renderPage('/matchmaking?player=Ada')
    expect(await screen.findByText('The selected player was not found by the matchmaking service.')).toBeInTheDocument()
    unmount()
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => url.endsWith('/api/players') ? response(players) : response({ detail: 'unavailable' }, 503)))
    renderPage('/matchmaking?player=Ada')
    expect(await screen.findByText('Request failed with HTTP 503')).toBeInTheDocument()
    cleanup()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(players)))
    renderPage('/matchmaking?player=Unknown')
    expect(await screen.findByRole('heading', { name: 'Player selection is invalid' })).toBeInTheDocument()
  })

  it('refreshes on player change and ignores a stale recommendation response', async () => {
    const pending = new Map<string, (value: Response) => void>()
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/players')) return Promise.resolve(response(players))
      const player = url.split('/').pop()!
      return new Promise<Response>(resolve => pending.set(player, resolve))
    })
    vi.stubGlobal('fetch', fetchMock)
    renderPage('/matchmaking?player=Ada')
    await screen.findByText('Loading recommendations for Ada…')
    fireEvent.change(screen.getByLabelText('Player to match'), { target: { value: 'Tania' } })
    await screen.findByText('Loading recommendations for Tania…')
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/matchmaking/Tania'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await act(async () => pending.get('Tania')?.(response(matchmaking('Tania', [{ recommended_player_id: 'Mira', rank: 1, score: 0.4, score_type: 'euclidean_neighbor_distance_lower_is_better', explanation: 'Tania explanation', feature_gaps: [] }]))))
    expect(await screen.findByRole('heading', { name: 'Closest players to Tania' })).toBeInTheDocument()
    await act(async () => pending.get('Ada')?.(response(matchmaking('Ada', [{ recommended_player_id: 'Old result', rank: 1, score: 0, score_type: 'euclidean_neighbor_distance_lower_is_better', explanation: 'stale', feature_gaps: [] }]))))
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Old result' })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Closest players to Tania' })).toBeInTheDocument()
  })
})
