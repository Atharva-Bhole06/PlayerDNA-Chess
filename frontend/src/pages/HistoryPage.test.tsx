import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoryPage } from './HistoryPage'
import type { RecentGame } from '../api/types'

function mockRecentGames(games: RecentGame[] | null, status = 200) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.endsWith('/api/account/games')) {
      if (status === 200) {
        return Promise.resolve(new Response(JSON.stringify(games), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthorized' }), { status }))
    }
    return Promise.reject(new Error(`Unhandled URL: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const sampleGames: RecentGame[] = [
  {
    game_id: 'game-101',
    opponent_username: 'GrandmasterBob',
    opponent_rating: 1450,
    color: 'white',
    result: 'win',
    termination: 'resignation',
    rating_before: 1200,
    rating_after: 1218,
    rating_change: 18,
    finished_at: '2026-10-10T14:30:00Z',
    analysis_status: 'completed',
    stars: 5,
  },
  {
    game_id: 'game-102',
    opponent_username: 'ChallengerCharlie',
    opponent_rating: 1300,
    color: 'black',
    result: 'loss',
    termination: 'checkmate',
    rating_before: 1218,
    rating_after: 1204,
    rating_change: -14,
    finished_at: '2026-10-11T16:00:00Z',
    analysis_status: 'queued',
    stars: null,
  },
  {
    game_id: 'game-103',
    opponent_username: 'DrawMasterDan',
    opponent_rating: 1200,
    color: 'white',
    result: 'draw',
    termination: 'stalemate',
    rating_before: 1204,
    rating_after: 1204,
    rating_change: 0,
    finished_at: '2026-10-11T18:00:00Z',
    analysis_status: 'failed',
    stars: null,
  },
  {
    game_id: 'game-104',
    opponent_username: 'PendingPaul',
    opponent_rating: 1220,
    color: 'black',
    result: 'win',
    termination: 'timeout',
    rating_before: 1204,
    rating_after: 1220,
    rating_change: 16,
    finished_at: '2026-10-12T00:30:00Z',
    analysis_status: 'processing',
    stars: null,
  },
]

describe('HistoryPage component', () => {
  it('displays loading state while games are fetching', () => {
    mockRecentGames(new Promise<any>(() => {}) as any)
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )
    expect(screen.getByText(/Loading match history…/i)).toBeInTheDocument()
  })

  it('renders empty state when no games have been played', async () => {
    mockRecentGames([])
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )
    expect(await screen.findByText(/No recorded competitive games found/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Play Matchmaking/i })).toBeInTheDocument()
  })

  it('renders error state with retry button on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/Network error/i)
    const retryBtn = screen.getByRole('button', { name: /Retry/i })
    expect(retryBtn).toBeInTheDocument()

    // Test retry
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(sampleGames), { status: 200 }))
    fireEvent.click(retryBtn)

    expect(await screen.findByText('GrandmasterBob')).toBeInTheDocument()
  })

  it('handles 401 unauthorized gracefully for unauthenticated users', async () => {
    mockRecentGames(null, 401)
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/Authentication required to view game history/i)
  })

  it('renders populated games with opponent, color, result, and rating progression', async () => {
    mockRecentGames(sampleGames)
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    // Check summary cards
    expect(await screen.findByText('4')).toBeInTheDocument() // 4 games
    expect(screen.getByText(/2W · 1L · 1D/)).toBeInTheDocument()
    expect(screen.getByText('+20 Elo')).toBeInTheDocument() // 18 - 14 + 0 + 16 = 20

    // Check game rows
    expect(screen.getByText('GrandmasterBob')).toBeInTheDocument()
    expect(screen.getByText('(1450)')).toBeInTheDocument()
    expect(screen.getByText('1200 → 1218')).toBeInTheDocument()
    expect(screen.getByText('(+18)')).toBeInTheDocument()
    expect(screen.getByText('Resignation')).toBeInTheDocument()

    // Check Black loss row
    expect(screen.getByText('ChallengerCharlie')).toBeInTheDocument()
    expect(screen.getByText('1218 → 1204')).toBeInTheDocument()
    expect(screen.getByText('(-14)')).toBeInTheDocument()
    expect(screen.getByText('Checkmate')).toBeInTheDocument()

    // Check Draw row
    expect(screen.getByText('DrawMasterDan')).toBeInTheDocument()
    expect(screen.getByText('(0)')).toBeInTheDocument()
    expect(screen.getByText('Stalemate')).toBeInTheDocument()
  })

  it('accurately represents post-game analysis states: completed with stars, queued, processing, and failed', async () => {
    mockRecentGames(sampleGames)
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    // Completed with stars
    expect(await screen.findByText(/★★★★★ \(5★\)/)).toBeInTheDocument()

    // Queued
    expect(screen.getByText('Queued')).toBeInTheDocument()

    // Processing
    expect(screen.getByText(/Processing/)).toBeInTheDocument()

    // Failed
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('links each history row to the game review route', async () => {
    mockRecentGames(sampleGames)
    render(
      <MemoryRouter>
        <HistoryPage />
      </MemoryRouter>
    )

    const reviewLinks = await screen.findAllByRole('link', { name: /Review match against/i })
    expect(reviewLinks).toHaveLength(4)
    expect(reviewLinks[0]).toHaveAttribute('href', '/report/game-101')
    expect(reviewLinks[1]).toHaveAttribute('href', '/report/game-102')
  })
})
