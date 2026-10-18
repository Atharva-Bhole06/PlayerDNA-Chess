import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MultiplayerGame } from './MultiplayerGame'
import type { MultiplayerGameState, PerformanceReport } from '../api/types'

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: any) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: any) => void) | null = null
  readyState = 1
  send = vi.fn()
  close = vi.fn()
  constructor() {
    MockWebSocket.instances.push(this)
    setTimeout(() => this.onopen?.(), 10)
  }
}

vi.stubGlobal('WebSocket', MockWebSocket)

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  MockWebSocket.instances = []
  vi.stubGlobal('WebSocket', MockWebSocket)
})

const completedGameState: MultiplayerGameState = {
  game_id: 'game-completed-1',
  status: 'completed',
  color: 'white',
  white_username: 'PlayerWhite',
  black_username: 'PlayerBlack',
  white_rating: 1250,
  black_rating: 1240,
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
  pgn: '1. e4 e5 2. Nf3 Nc6',
  result: '1-0',
  termination: 'resignation',
  white_time_ms: 180000,
  black_time_ms: 175000,
  turn_started_at: null,
  ply_count: 4,
  draw_offered_by: null,
  analysis_status: 'completed',
}

const completedReport: PerformanceReport = {
  game_id: 'game-completed-1',
  analysis_status: 'completed',
  result: '1-0',
  opponent_username: 'PlayerBlack',
  opponent_rating: 1240,
  move_count: 4,
  duration_seconds: 60,
  moves_analyzed: 2,
  cp_evaluable_moves: 2,
  average_cpl: 12.5,
  blunders: 0,
  mistakes: 0,
  inaccuracies: 0,
  best_move_agreement_pct: 100,
  accuracy_pct: 88.2,
  stars: 4,
  star_reason: '4 stars: estimated accuracy 88.2% with 0 engine-defined blunders.',
  performance_version: 'performance_stars_v1',
  mate_events: null,
  critical_moves: [
    { ply: 3, played_move: 'Nf3', best_move: 'Nf3', cpl: 10, classification: 'best_or_near_best' }
  ],
  recommendations: ['Great game opening with classic development.'],
  message: null,
}

function mockGameApi(
  gameState: MultiplayerGameState | null,
  report: PerformanceReport | null,
  status = 200
) {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/games/game-completed-1/report')) {
      if (report) {
        return Promise.resolve(new Response(JSON.stringify(report), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Report not ready' }), { status: 409 }))
    }
    if (url.includes('/api/games/game-completed-1')) {
      if (status === 200 && gameState) {
        return Promise.resolve(new Response(JSON.stringify(gameState), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Forbidden' }), { status }))
    }
    return Promise.reject(new Error(`Unhandled URL ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('MultiplayerGame completed review & post-game reports', () => {
  it('renders completed game with replay controls and allows stepping through moves', async () => {
    mockGameApi(completedGameState, completedReport)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="game-completed-1" />
      </MemoryRouter>
    )

    // Heading shows Game Review & Replay
    expect(await screen.findByRole('heading', { name: /Game Review & Replay/i })).toBeInTheDocument()
    expect(screen.getByText(/GAME COMPLETED/i)).toBeInTheDocument()

    // Replay controls exist
    const prevBtn = screen.getByRole('button', { name: /Previous move/i })
    const nextBtn = screen.getByRole('button', { name: /Next move/i })
    const firstBtn = screen.getByRole('button', { name: /First move/i })
    const lastBtn = screen.getByRole('button', { name: /Final position/i })

    expect(prevBtn).toBeInTheDocument()
    expect(nextBtn).toBeInTheDocument()

    // Initially at final position (ply 4, Nc6)
    expect(screen.getByText(/Final position · Ply 4/i)).toBeInTheDocument()
    expect(nextBtn).toBeDisabled()
    expect(lastBtn).toBeDisabled()

    // Step back to ply 3 (Nf3)
    fireEvent.click(prevBtn)
    expect(screen.getAllByText(/Nf3/i).length).toBeGreaterThan(0)

    // Step to start
    fireEvent.click(firstBtn)
    expect(screen.getByText(/Starting position/i)).toBeInTheDocument()
    expect(prevBtn).toBeDisabled()
    expect(firstBtn).toBeDisabled()

    // Step forward
    fireEvent.click(nextBtn)
    expect(screen.getAllByText(/e4/i).length).toBeGreaterThan(0)

    // Step back to end
    fireEvent.click(lastBtn)
    expect(screen.getByText(/Final position/i)).toBeInTheDocument()
  })

  it('displays full genuine completed Stockfish performance metrics', async () => {
    mockGameApi(completedGameState, completedReport)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="game-completed-1" />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: /Performance Report/i })).toBeInTheDocument()
    expect(screen.getByText('88.2%')).toBeInTheDocument() // accuracy
    expect(screen.getByText('12.5')).toBeInTheDocument() // average cpl
    expect(screen.getByText('100.0%')).toBeInTheDocument() // best move agreement (toFixed(1))
    expect(screen.getByText('★★★★☆')).toBeInTheDocument() // stars
    expect(screen.getByText(/4 stars: estimated accuracy 88.2%/i)).toBeInTheDocument()
    expect(screen.getByText(/Great game opening with classic development./i)).toBeInTheDocument()
  })

  it('accurately displays queued analysis state and provides analysis worker instructions', async () => {
    const queuedReport: PerformanceReport = {
      ...completedReport,
      analysis_status: 'queued',
      message: 'Analysis is queued.',
      accuracy_pct: null,
      average_cpl: null,
      stars: null,
      critical_moves: null,
      recommendations: null,
    }
    mockGameApi(completedGameState, queuedReport)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="game-completed-1" />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: /Analysis Queued/i })).toBeInTheDocument()
    expect(screen.getByText(/python -m backend.analysis_worker --once/i)).toBeInTheDocument()
    // Does NOT show fabricated accuracy
    expect(screen.queryByText('88.2%')).not.toBeInTheDocument()
  })

  it('accurately displays analysis failed state without fabricating reports', async () => {
    const failedReport: PerformanceReport = {
      ...completedReport,
      analysis_status: 'failed',
      message: 'Engine process crashed during calculation.',
      accuracy_pct: null,
      stars: null,
    }
    mockGameApi(completedGameState, failedReport)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="game-completed-1" />
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: /Analysis Unavailable/i })).toBeInTheDocument()
    expect(screen.getByText(/Engine process crashed during calculation./i)).toBeInTheDocument()
  })

  it('denies access with clear error when player is unauthorized (403)', async () => {
    mockGameApi(null, null, 403)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="game-completed-1" />
      </MemoryRouter>
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(/You do not have permission to view this game/i)
  })
})

describe('MultiplayerGame normal play restoration regression suite', () => {
  const activeCasualGame: MultiplayerGameState = {
    game_id: 'a86c4b31-e69c-4c83-9ce1-9be81c93276c',
    status: 'active',
    color: 'white',
    white_username: 'demo1',
    black_username: 'demo2',
    white_rating: 1200,
    black_rating: 1200,
    fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
    pgn: '[Event "Casual Match"]\n1. e4',
    result: null,
    termination: null,
    white_time_ms: 300000,
    black_time_ms: 300000,
    turn_started_at: null,
    ply_count: 1,
    draw_offered_by: null,
    analysis_status: 'not_queued',
  }

  it('restores normal play from REST without timing out', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/games/a86c4b31-e69c-4c83-9ce1-9be81c93276c')) {
        return Promise.resolve(new Response(JSON.stringify(activeCasualGame), { status: 200 }))
      }
      return Promise.reject(new Error(`Unhandled URL ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="a86c4b31-e69c-4c83-9ce1-9be81c93276c" />
      </MemoryRouter>
    )

    // Game board and players load successfully
    expect(await screen.findByText(/demo2 · Casual \(Unrated\)/i)).toBeInTheDocument()
    expect(screen.getByText(/demo1 · Casual \(Unrated\)/i)).toBeInTheDocument()

    // Does NOT display timeout error
    expect(screen.queryByText(/Game restoration timed out/i)).not.toBeInTheDocument()
  })

  it('restores authoritative game, position, and moves after page refresh', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/games/a86c4b31-e69c-4c83-9ce1-9be81c93276c')) {
        return Promise.resolve(new Response(JSON.stringify(activeCasualGame), { status: 200 }))
      }
      return Promise.reject(new Error(`Unhandled URL ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    const { unmount } = render(
      <MemoryRouter>
        <MultiplayerGame gameId="a86c4b31-e69c-4c83-9ce1-9be81c93276c" />
      </MemoryRouter>
    )

    expect(await screen.findByText(/demo2 · Casual \(Unrated\)/i)).toBeInTheDocument()
    unmount()

    // Simulate second load (page refresh)
    render(
      <MemoryRouter>
        <MultiplayerGame gameId="a86c4b31-e69c-4c83-9ce1-9be81c93276c" />
      </MemoryRouter>
    )

    expect(await screen.findByText(/demo2 · Casual \(Unrated\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Black to move/i)).toBeInTheDocument()
    expect(screen.queryByText(/Game restoration timed out/i)).not.toBeInTheDocument()
  })

  it('prevents stale REST response from overwriting newer WebSocket state', async () => {
    let resolveRest: (value: Response) => void
    const restPromise = new Promise<Response>(resolve => {
      resolveRest = resolve
    })

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/games/a86c4b31-e69c-4c83-9ce1-9be81c93276c')) {
        return restPromise
      }
      return Promise.reject(new Error(`Unhandled URL ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="a86c4b31-e69c-4c83-9ce1-9be81c93276c" />
      </MemoryRouter>
    )

    // Initially loading
    expect(screen.getByText(/Restoring the saved game…/i)).toBeInTheDocument()

    // Fast WebSocket message with ply_count 2 arrives first
    const newerState: MultiplayerGameState = {
      ...activeCasualGame,
      fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      pgn: '[Event "Casual Match"]\n1. e4 e5',
      ply_count: 2,
    }

    // Trigger WebSocket message
    const wsInstance = MockWebSocket.instances[MockWebSocket.instances.length - 1]
    wsInstance?.onmessage?.({ data: JSON.stringify({ type: 'state', game: newerState }) })

    // Board updates to newer position
    expect(await screen.findByText(/White to move/i)).toBeInTheDocument()

    // Now slower REST response with ply_count 1 resolves
    resolveRest!(new Response(JSON.stringify(activeCasualGame), { status: 200 }))

    // Ensure the board remains at White to move (ply 2) and is not overwritten back to Black to move (ply 1)
    await new Promise(r => setTimeout(r, 50))
    expect(screen.getByText(/White to move/i)).toBeInTheDocument()
    expect(screen.queryByText(/Game restoration timed out/i)).not.toBeInTheDocument()
  })

  it('renders board with Black at bottom when user is assigned Black', async () => {
    const blackGameState: MultiplayerGameState = {
      ...activeCasualGame,
      color: 'black',
    }

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/games/a86c4b31-e69c-4c83-9ce1-9be81c93276c')) {
        return Promise.resolve(new Response(JSON.stringify(blackGameState), { status: 200 }))
      }
      return Promise.reject(new Error(`Unhandled URL ${url}`))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <MultiplayerGame gameId="a86c4b31-e69c-4c83-9ce1-9be81c93276c" />
      </MemoryRouter>
    )

    // Wait for game to mount
    expect(await screen.findByText(/demo2 · Casual \(Unrated\)/i)).toBeInTheDocument()

    // Board orientation for Black has rank 1 at the top and rank 8 at the bottom
    // Top-left square is h1, bottom-right square is a8
    const gridcells = screen.getAllByRole('gridcell')
    expect(gridcells[0]).toHaveAttribute('aria-label', expect.stringContaining('h1'))
    expect(gridcells[gridcells.length - 1]).toHaveAttribute('aria-label', expect.stringContaining('a8'))
  })
})
