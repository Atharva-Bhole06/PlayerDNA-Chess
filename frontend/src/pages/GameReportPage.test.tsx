import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameReportPage } from './GameReportPage'
import type { PerformanceReport } from '../api/types'

function mockReportApi(report: PerformanceReport | null, status = 200) {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/games/game-123/report')) {
      if (status === 200 && report) {
        return Promise.resolve(new Response(JSON.stringify(report), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Game not found' }), { status }))
    }
    if (url.includes('/api/games/game-123/analyze') && init?.method === 'POST') {
      return Promise.resolve(new Response(JSON.stringify({ message: 'Analysis job queued' }), { status: 202 }))
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

const sampleCompletedReport: PerformanceReport = {
  game_id: 'game-123',
  analysis_status: 'completed',
  stars: 5,
  star_reason: 'Excellent game! High engine agreement and no blunders.',
  accuracy_pct: 94.2,
  average_cpl: 18.5,
  best_move_agreement_pct: 88.0,
  blunders: 0,
  mistakes: 1,
  inaccuracies: 2,
  critical_moves: [
    {
      ply: 8,
      played_move: 'd5',
      best_move: 'Nf6',
      cpl: 55,
      classification: 'mistake',
    },
  ],
  recommendations: [
    'Solid tactical vigilance throughout the middle game.',
    'Review move 8 (d5) where Nf6 preserved center control.',
  ],
  message: 'Post-game analysis complete.',
  result: '1-0',
  opponent_username: 'RivalGrandmaster',
  opponent_rating: 1250,
  move_count: 8,
  duration_seconds: 60,
  moves_analyzed: 8,
  cp_evaluable_moves: 8,
  performance_version: 'performance_stars_v1',
  mate_events: null,
  // Perspective & metadata
  color: 'white',
  user_won: true,
  result_outcome: 'win',
  user_rating: 1200,
  user_rating_after: 1216,
  rating_change: 16,
  is_rated: true,
  finished_at: '2026-10-18T10:00:00Z',
  termination: 'resignation',
  pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O d5',
  current_fen: 'r1bqk1nr/ppp2ppp/2n5/2bp4/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5',
  moves: [
    {
      ply: 1,
      move_number: 1,
      color: 'white',
      user_id: 'user-1',
      is_user_move: true,
      played_san: 'e4',
      played_uci: 'e2e4',
      fen_before: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      fen_after: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      played_score_cp: 25,
      cpl: 0,
      best_move_san: 'e4',
      best_move_uci: 'e2e4',
      classification: 'best_or_near_best',
      explanation: 'Book opening move controlling the central squares d5 and f5.',
    },
    {
      ply: 2,
      move_number: 1,
      color: 'black',
      user_id: 'opp-1',
      is_user_move: false,
      played_san: 'e5',
      played_uci: 'e7e5',
      fen_before: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      fen_after: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      played_score_cp: -20,
      cpl: 5,
      best_move_san: 'e5',
      best_move_uci: 'e7e5',
      classification: 'best_or_near_best',
      explanation: 'Natural symmetrical response occupying the center.',
    },
    {
      ply: 3,
      move_number: 2,
      color: 'white',
      user_id: 'user-1',
      is_user_move: true,
      played_san: 'Nf3',
      played_uci: 'g1f3',
      fen_before: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
      fen_after: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      played_score_cp: 30,
      cpl: 0,
      best_move_san: 'Nf3',
      best_move_uci: 'g1f3',
      classification: 'best_or_near_best',
      explanation: 'Standard knight development attacking the undefended pawn on e5.',
    },
    {
      ply: 4,
      move_number: 2,
      color: 'black',
      user_id: 'opp-1',
      is_user_move: false,
      played_san: 'Nc6',
      played_uci: 'b8c6',
      fen_before: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
      fen_after: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      played_score_cp: -25,
      cpl: 0,
      best_move_san: 'Nc6',
      best_move_uci: 'b8c6',
      classification: 'best_or_near_best',
      explanation: 'Solid defense of the e5 pawn developing a minor piece.',
    },
    {
      ply: 5,
      move_number: 3,
      color: 'white',
      user_id: 'user-1',
      is_user_move: true,
      played_san: 'Bc4',
      played_uci: 'f1c4',
      fen_before: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
      fen_after: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      played_score_cp: 35,
      cpl: 0,
      best_move_san: 'Bc4',
      best_move_uci: 'f1c4',
      classification: 'best_or_near_best',
      explanation: 'Italian Game opening targeting f7.',
    },
    {
      ply: 6,
      move_number: 3,
      color: 'black',
      user_id: 'opp-1',
      is_user_move: false,
      played_san: 'Bc5',
      played_uci: 'f8c5',
      fen_before: 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3',
      fen_after: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      played_score_cp: -30,
      cpl: 5,
      best_move_san: 'Bc5',
      best_move_uci: 'f8c5',
      classification: 'best_or_near_best',
      explanation: 'Giuoco Piano setup meeting bishop with bishop.',
    },
    {
      ply: 7,
      move_number: 4,
      color: 'white',
      user_id: 'user-1',
      is_user_move: true,
      played_san: 'O-O',
      played_uci: 'e1g1',
      fen_before: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
      fen_after: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4',
      played_score_cp: 40,
      cpl: 0,
      best_move_san: 'O-O',
      best_move_uci: 'e1g1',
      classification: 'best_or_near_best',
      explanation: 'Castling tucks the king safely into the corner.',
    },
    {
      ply: 8,
      move_number: 4,
      color: 'black',
      user_id: 'opp-1',
      is_user_move: false,
      played_san: 'd5',
      played_uci: 'd7d5',
      fen_before: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4',
      fen_after: 'r1bqk1nr/ppp2ppp/2n5/2bp4/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 5',
      played_score_cp: -95,
      cpl: 55,
      best_move_san: 'Nf6',
      best_move_uci: 'g8f6',
      classification: 'mistake',
      explanation: 'Premature central thrust that loses a pawn after exd5.',
    },
  ],
  opponent_report: {
    username: 'RivalGrandmaster',
    rating: 1250,
    color: 'black',
    accuracy_pct: 78.4,
    average_cpl: 45.2,
    blunders: 1,
    mistakes: 2,
    inaccuracies: 3,
  },
  previous_game_comparison: {
    previous_game_id: 'game-prev-99',
    finished_at: '2026-10-15T14:00:00Z',
    opponent_username: 'PriorPlayer',
    accuracy_current: 94.2,
    accuracy_previous: 88.0,
    accuracy_delta: 6.2,
    average_cpl_current: 18.5,
    average_cpl_previous: 28.0,
    average_cpl_delta: -9.5,
    blunders_current: 0,
    blunders_previous: 1,
    blunders_delta: -1,
  },
}

function renderReportPage(initialRoute = '/report/game-123') {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route path="/report/:id" element={<GameReportPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('GameReportPage component', () => {
  it('displays loading indicator while fetching game report', () => {
    mockReportApi(new Promise<any>(() => {}) as any)
    renderReportPage()
    expect(screen.getByText(/Retrieving saved match analysis and performance metrics…/i)).toBeInTheDocument()
  })

  it('renders error state and handles retry button on fetch failure', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Backend connection failed'))
    vi.stubGlobal('fetch', fetchMock)

    renderReportPage()

    expect(await screen.findByRole('alert')).toHaveTextContent(/Unable to load game performance report/i)
    const retryBtn = screen.getByRole('button', { name: /Retry Loading/i })
    expect(retryBtn).toBeInTheDocument()

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(sampleCompletedReport), { status: 200 }))
    fireEvent.click(retryBtn)

    expect(await screen.findByText('Victory')).toBeInTheDocument()
  })

  it('renders queued / processing state with manual retry button and triggers analysis', async () => {
    const queuedReport: PerformanceReport = {
      ...sampleCompletedReport,
      analysis_status: 'queued',
      stars: null,
      accuracy_pct: null,
      average_cpl: null,
      moves: [],
    }
    const fetchMock = mockReportApi(queuedReport)

    renderReportPage()

    expect(await screen.findByRole('region', { name: /Analysis Queued/i })).toBeInTheDocument()
    expect(screen.getByText(/Waiting for Stockfish analysis worker/i)).toBeInTheDocument()

    const triggerBtn = screen.getByRole('button', { name: /Request Analysis Now/i })
    expect(triggerBtn).toBeInTheDocument()

    fireEvent.click(triggerBtn)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/games/game-123/analyze'),
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('renders complete game report with match summary, scorecards, opponent and previous game comparison', async () => {
    mockReportApi(sampleCompletedReport)
    renderReportPage()

    // Header & Outcome
    expect(await screen.findByText('Victory')).toBeInTheDocument()
    expect(screen.getAllByText('+16').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('RivalGrandmaster').length).toBeGreaterThan(0)

    // Performance Stars & Accuracy Scorecard
    expect(screen.getByText(/5 out of 5 stars/i)).toBeInTheDocument()
    expect(screen.getAllByText('94.2%').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/18\.5/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('88%')).toBeInTheDocument()

    // Head-to-Head Comparison
    expect(screen.getByText('Head-to-Head Tactical Comparison')).toBeInTheDocument()
    expect(screen.getByText('78.4%')).toBeInTheDocument()

    // Move Quality Breakdown
    expect(screen.getByText('Your Move Classification Breakdown')).toBeInTheDocument()
    expect(screen.getByText(/Position Evaluation/i)).toBeInTheDocument()

    // Previous Game Comparison
    expect(screen.getByText('Historical Performance Trajectory')).toBeInTheDocument()
    expect(screen.getByText('+6.2%')).toBeInTheDocument()
    expect(screen.getByText('-9.5 cp')).toBeInTheDocument()

    // Switch to Moves tab
    const movesTabBtn = screen.getByRole('button', { name: /Moves/i })
    fireEvent.click(movesTabBtn)
    expect(screen.getByText(/Move-by-Move Evaluation/i)).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getAllByText('e4').length).toBeGreaterThanOrEqual(1)
    expect(within(table).getByText('d5')).toBeInTheDocument()

    // Switch to Coach tab
    const coachTabBtn = screen.getByRole('button', { name: /Coach/i })
    fireEvent.click(coachTabBtn)
    expect(screen.getByText(/Stockfish Coach's Take/i)).toBeInTheDocument()
    expect(screen.getByText(/1\. What happened\?/i)).toBeInTheDocument()
    expect(screen.getByText(/2\. Engine Recommendation/i)).toBeInTheDocument()
    expect(screen.getByText(/3\. Why is it better\?/i)).toBeInTheDocument()
    expect(screen.getByText(/Lesson to Remember/i)).toBeInTheDocument()
  })

  it('filters moves by classification when filter buttons are clicked in Moves tab', async () => {
    mockReportApi(sampleCompletedReport)
    renderReportPage()

    // Navigate to Moves tab
    const movesTabBtn = await screen.findByRole('button', { name: /Moves/i })
    fireEvent.click(movesTabBtn)

    expect(await screen.findByText(/Move-by-Move Evaluation/i)).toBeInTheDocument()
    const table = screen.getByRole('table')

    // Initially table has moves
    expect(within(table).getAllByText('e4').length).toBeGreaterThanOrEqual(1)

    // Mistakes filter
    const mistakeFilterBtn = screen.getByRole('button', { name: /Mistakes \(1\)/i })
    expect(mistakeFilterBtn).toBeInTheDocument()

    fireEvent.click(mistakeFilterBtn)

    // Only move 8 (d5) is a mistake in table
    expect(within(table).getByText('d5')).toBeInTheDocument()
    expect(within(table).queryAllByText('e4')).toHaveLength(0)

    // Click All filter to reset
    const allFilterBtn = screen.getByRole('button', { name: /All Moves \(8\)/i })
    fireEvent.click(allFilterBtn)
    expect(within(table).getAllByText('e4').length).toBeGreaterThanOrEqual(1)
  })

  it('navigates through moves via prev/next board buttons and updates active move', async () => {
    mockReportApi(sampleCompletedReport)
    renderReportPage()

    // Navigate to Coach tab to verify active move synchronization
    const coachTabBtn = await screen.findByRole('button', { name: /Coach/i })
    fireEvent.click(coachTabBtn)

    // Initially at ply 1 (1. e4)
    expect(screen.getByText(/1\. e4/i)).toBeInTheDocument()
    expect(screen.getByText(/Book opening move controlling the central squares/i)).toBeInTheDocument()

    const nextBtn = screen.getByRole('button', { name: /Next move/i })
    const prevBtn = screen.getByRole('button', { name: /Previous move/i })

    // Step forward once to ply 2 (1... e5)
    fireEvent.click(nextBtn)
    expect(screen.getByText(/1\.\.\. e5/i)).toBeInTheDocument()
    expect(screen.getByText(/Natural symmetrical response occupying the center/i)).toBeInTheDocument()

    // Step backward back to ply 1
    fireEvent.click(prevBtn)
    expect(screen.getByText(/1\. e4/i)).toBeInTheDocument()
    expect(screen.getByText(/Book opening move controlling the central squares/i)).toBeInTheDocument()
  })
})
