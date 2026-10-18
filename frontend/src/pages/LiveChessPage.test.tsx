import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveChessPage } from './LiveChessPage'
import { AuthContext } from '../context/AuthContext'

const initialFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
function health(stockfish_available = true) { return { status: 'ok', database_available: true, stockfish_available } }
function analysis(overrides: Record<string, unknown> = {}) { return { fen: initialFen, best_move: 'e2e4', best_move_san: 'e4', evaluation: 0.42, evaluation_mate: null, evaluation_type: 'cp', principal_variation: ['e4', 'e5', 'Nf3'], depth: 12, analysis_time_ms: 203.5, terminal_reason: null, ...overrides } }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }) }
function mockApi(post: (url: string, init: RequestInit) => Promise<Response> = async () => response(analysis()), stockfish = true) {
  const fetchMock = vi.fn().mockImplementation((url: string, init: RequestInit) => url.endsWith('/api/health') ? Promise.resolve(response(health(stockfish))) : post(url, init))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
function playMove(from: string, to: string) {
  fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(`on ${from}$`) }))
  fireEvent.click(screen.getByRole('gridcell', { name: new RegExp(`(?:on|Empty) ${to}$`) }))
}
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('Live Chess & Analysis page', () => {
  it('shows board, FEN, legal destination markers and changes side to move after a legal move', async () => {
    mockApi()
    render(<LiveChessPage />)
    expect(await screen.findByText('White to move.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current FEN')).toHaveValue(initialFen)
    fireEvent.click(screen.getByRole('gridcell', { name: 'White pawn on e2' }))
    expect(screen.getByRole('gridcell', { name: 'Empty e4' })).toHaveClass('is-legal-target')
    fireEvent.click(screen.getByRole('gridcell', { name: 'Empty e4' }))
    expect(await screen.findByText('Black to move.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current FEN')).toHaveValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
  })

  it('rejects illegal moves and resets the board', async () => {
    mockApi()
    render(<LiveChessPage />)
    await screen.findByText('White to move.')
    fireEvent.click(screen.getByRole('gridcell', { name: 'White pawn on e2' }))
    fireEvent.click(screen.getByRole('gridcell', { name: 'Empty e5' }))
    expect(screen.getByText('That destination is not a legal move.')).toBeInTheDocument()
    playMove('e2', 'e4')
    expect(await screen.findByText('Black to move.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reset board' }))
    expect(await screen.findByText('White to move.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current FEN')).toHaveValue(initialFen)
  })

  it('recognizes checkmate locally and does not fabricate an engine call for terminal positions', async () => {
    const fetchMock = mockApi()
    render(<LiveChessPage />)
    await screen.findByText('White to move.')
    playMove('f2', 'f3')
    playMove('e7', 'e5')
    playMove('g2', 'g4')
    playMove('d8', 'h4')
    expect(await screen.findByText('Checkmate - Black wins.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Position is terminal' })).toBeDisabled()
    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/chess/recommend'))).toHaveLength(0)
  })

  it('renders actual centipawn evaluation units, best move and principal variation, then applies the move', async () => {
    const fetchMock = mockApi(async () => response(analysis()))
    render(<LiveChessPage />)
    await screen.findByText('ENGINE AVAILABLE')
    fireEvent.click(screen.getByRole('button', { name: 'Analyze position' }))
    expect(await screen.findByText('+0.42 pawns')).toBeInTheDocument()
    expect(screen.getAllByText('e4').length).toBeGreaterThan(0)
    expect(screen.getByText('e5')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/chess/recommend', expect.objectContaining({ method: 'POST', body: JSON.stringify({ fen: initialFen }) }))
    fireEvent.click(screen.getByRole('button', { name: 'Play move' }))
    expect(await screen.findByText('Black to move.')).toBeInTheDocument()
    expect(screen.getByLabelText('Current FEN')).toHaveValue('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')
  })

  it('shows a loading state while engine analysis is pending', async () => {
    mockApi(() => new Promise<Response>(() => {}))
    render(<LiveChessPage />)
    await screen.findByText('ENGINE AVAILABLE')
    fireEvent.click(screen.getByRole('button', { name: 'Analyze position' }))
    expect(await screen.findByText('Waiting for backend analysis…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Analyzing position…' })).toBeDisabled()
  })

  it('distinguishes mate scores and displays terminal results without missing values as numbers', async () => {
    mockApi(async () => response(analysis({ evaluation: null, evaluation_mate: -3, evaluation_type: 'mate', best_move: 'd8h4', best_move_san: 'Qh4#' })))
    render(<LiveChessPage />)
    await screen.findByText('ENGINE AVAILABLE')
    fireEvent.click(screen.getByRole('button', { name: 'Analyze position' }))
    expect(await screen.findByText('Black mates in 3')).toBeInTheDocument()
    expect(screen.getByText('Mate score, not a centipawn evaluation')).toBeInTheDocument()
  })

  it('shows unavailable engine and API error states', async () => {
    const fetchMock = mockApi(async () => response({ detail: 'Stockfish is unavailable' }, 503), false)
    render(<LiveChessPage />)
    expect(await screen.findByText(/Stockfish is unavailable/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Engine unavailable' })).toBeDisabled()
    expect(fetchMock.mock.calls.filter(call => String(call[0]).endsWith('/api/chess/recommend'))).toHaveLength(0)
    cleanup()
    mockApi(async () => response({ detail: 'Invalid FEN' }, 422))
    render(<LiveChessPage />)
    await screen.findByText('ENGINE AVAILABLE')
    fireEvent.click(screen.getByRole('button', { name: 'Analyze position' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('backend rejected this position')
  })

  it('does not apply stale analysis after the board position changes', async () => {
    let resolveAnalysis!: (response: Response) => void
    mockApi(() => new Promise<Response>(resolve => { resolveAnalysis = resolve }))
    render(<LiveChessPage />)
    await screen.findByText('ENGINE AVAILABLE')
    fireEvent.click(screen.getByRole('button', { name: 'Analyze position' }))
    await screen.findByText('Waiting for backend analysis…')
    playMove('e2', 'e4')
    expect(await screen.findByText('Black to move.')).toBeInTheDocument()
    await act(async () => resolveAnalysis(response(analysis())))
    expect(screen.queryByLabelText('Engine analysis result')).not.toBeInTheDocument()
  })

  it('triggers Stockfish response after player move in AI mode', async () => {
    const fetchMock = mockApi(async () => response(analysis({
      best_move: 'e7e5',
      best_move_san: 'e5',
    })))

    render(<LiveChessPage />)
    // Switch to AI mode via query parameter mock or direct URL
    window.history.pushState({}, '', '/live-chess?mode=ai')
    cleanup()

    render(<LiveChessPage />)
    expect(await screen.findByRole('heading', { name: 'Play Stockfish AI' })).toBeInTheDocument()

    // Player moves e2 to e4
    playMove('e2', 'e4')

    // Expect Stockfish was queried for Black's move
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/chess/recommend',
      expect.objectContaining({ method: 'POST' })
    )

    // After AI move (e7e5), it should be White's turn again
    expect(await screen.findByText('White to move.')).toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('renders Coach guidance panel and suggestions in Coach mode', async () => {
    mockApi(async (_input, init) => {
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
      const fen = body.fen || ''
      if (fen.includes(' b ')) {
        return response(analysis({
          best_move: 'e7e5',
          best_move_san: 'e5',
          evaluation: -0.35,
        }))
      }
      return response(analysis({
        best_move: 'g1f3',
        best_move_san: 'Nf3',
        evaluation: 0.35,
      }))
    })

    window.history.pushState({}, '', '/live-chess?mode=coach')
    render(<LiveChessPage />)

    expect(await screen.findByRole('heading', { name: 'Play with Coach' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Live Suggestions' })).toBeInTheDocument()

    // Make a move
    playMove('e2', 'e4')

    // Coach analyzes the position
    expect(await screen.findByText('+0.35 pawns')).toBeInTheDocument()
    expect(screen.getByText('Nf3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play suggested move' })).toBeInTheDocument()

    window.history.pushState({}, '', '/')
  })

  it('renders Normal Play matchmaking lobby when mode=unrated without displaying playable board or Stockfish card', async () => {
    window.history.pushState({}, '', '/live-chess?mode=unrated')
    render(
      <MemoryRouter initialEntries={['/live-chess?mode=unrated']}>
        <AuthContext.Provider value={{
          user: { username: 'BravePlayer', rating: 1250, games_played: 5, wins: 3, losses: 2, draws: 0, player_dna_status: 'balanced', is_admin: false },
          loading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), clearError: vi.fn()
        }}>
          <LiveChessPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(await screen.findByRole('heading', { name: 'Normal Play' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Find a Human Opponent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Find Human Opponent' })).toBeInTheDocument()
    // Should NOT display Stockfish Position Analysis card
    expect(screen.queryByRole('heading', { name: 'Position analysis' })).not.toBeInTheDocument()
    // Should NOT display playable board before match
    expect(screen.queryByRole('grid', { name: 'Chess board position' })).not.toBeInTheDocument()
    window.history.pushState({}, '', '/')
  })

  it('shows searching modal when queuing and supports cancellation', async () => {
    window.history.pushState({}, '', '/live-chess?mode=unrated')
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/matchmaking/queue')) {
        return Promise.resolve(response({ status: 'waiting', wait_seconds: 3, queue_length: 1 }))
      }
      return Promise.resolve(response({}))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/live-chess?mode=unrated']}>
        <AuthContext.Provider value={{
          user: { username: 'BravePlayer', rating: 1250, games_played: 5, wins: 3, losses: 2, draws: 0, player_dna_status: 'balanced', is_admin: false },
          loading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), clearError: vi.fn()
        }}>
          <LiveChessPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )

    const findBtn = await screen.findByRole('button', { name: 'Find Human Opponent' })
    fireEvent.click(findBtn)

    expect(await screen.findByRole('heading', { name: 'Searching for Opponent…' })).toBeInTheDocument()
    expect(screen.getByText(/Waiting for an available human player/)).toBeInTheDocument()

    const cancelBtn = screen.getByRole('button', { name: 'Cancel Search' })
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Searching for Opponent…' })).not.toBeInTheDocument()
    })
    window.history.pushState({}, '', '/')
  })

  it('prompts guest to sign in when visiting Normal Play while unauthenticated', async () => {
    window.history.pushState({}, '', '/live-chess?mode=unrated')
    render(
      <MemoryRouter initialEntries={['/live-chess?mode=unrated']}>
        <AuthContext.Provider value={{
          user: null, loading: false, error: null, login: vi.fn(), register: vi.fn(), logout: vi.fn(), refreshUser: vi.fn(), clearError: vi.fn()
        }}>
          <LiveChessPage />
        </AuthContext.Provider>
      </MemoryRouter>
    )

    expect(await screen.findByText('Sign in to queue for human multiplayer games.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign In to Play' })).toHaveAttribute('href', '/login?from=/live-chess?mode=unrated')
    window.history.pushState({}, '', '/')
  })
})
