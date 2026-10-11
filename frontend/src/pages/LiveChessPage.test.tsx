import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LiveChessPage } from './LiveChessPage'

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
})
