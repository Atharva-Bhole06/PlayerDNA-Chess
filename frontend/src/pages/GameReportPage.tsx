import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Chess, type Square } from 'chess.js'
import { ApiError, getPerformanceReport, triggerGameAnalysis } from '../api/client'
import type { MoveAnalysisItem, PerformanceReport } from '../api/types'

const files = 'abcdefgh'
const symbols: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s'
  const mins = Math.floor(seconds / 60)
  const remSecs = seconds % 60
  if (mins === 0) return `${remSecs}s`
  return `${mins}m ${remSecs}s`
}

function formatClassification(cls?: string | null): { label: string; badgeClass: string; icon: string } {
  switch (cls) {
    case 'best_or_near_best':
      return { label: 'Best Move', badgeClass: 'badge-best', icon: '★' }
    case 'inaccuracy':
      return { label: 'Inaccuracy', badgeClass: 'badge-inaccuracy', icon: '?!' }
    case 'mistake':
      return { label: 'Mistake', badgeClass: 'badge-mistake', icon: '?' }
    case 'blunder':
      return { label: 'Blunder', badgeClass: 'badge-blunder', icon: '??' }
    case 'missed_forced_mate':
      return { label: 'Missed Mate', badgeClass: 'badge-mate', icon: '⚡' }
    case 'allowed_forced_mate':
      return { label: 'Allowed Mate', badgeClass: 'badge-mate-allowed', icon: '⚠️' }
    case 'mate_score_changed':
    case 'mate_outcome_preserved':
    case 'mate_evaluation':
      return { label: 'Forced Mate Line', badgeClass: 'badge-mate', icon: 'M' }
    default:
      return { label: 'Book / Normal', badgeClass: 'badge-analyzed', icon: '•' }
  }
}

interface CoachInsights {
  whatHappened: string
  betterMoveSan: string | null
  whyBetter: string
  lesson: string
}

function getCoachInsights(move: MoveAnalysisItem | null): CoachInsights {
  if (!move) {
    return {
      whatHappened: 'Initial starting position. All pieces stand on their starting squares.',
      betterMoveSan: null,
      whyBetter: 'Stake out the center with e4, d4, or develop a knight.',
      lesson: 'Control the center and develop minor pieces quickly in the opening.',
    }
  }

  const isUser = move.is_user_move
  const side = move.color === 'white' ? 'White' : 'Black'
  const playerRef = isUser ? 'You' : side
  const oppRef = isUser ? 'your opponent' : (move.color === 'white' ? 'Black' : 'White')
  const isBest = move.classification === 'best_or_near_best' || move.best_move_agreement
  const isBlunder = move.classification === 'blunder'
  const isMistake = move.classification === 'mistake'
  const isInaccuracy = move.classification === 'inaccuracy'
  const isMissedMate = move.classification === 'missed_forced_mate'
  const isAllowedMate = move.classification === 'allowed_forced_mate'

  const playedSan = move.played_san
  const isCheck = playedSan.includes('+')
  const isCheckmate = playedSan.includes('#')
  const isCapture = playedSan.includes('x')
  const isCastling = playedSan.startsWith('O-O')

  let whatHappened = move.explanation || ''
  if (!whatHappened) {
    if (isCheckmate) {
      whatHappened = `${playerRef} played ${playedSan}, delivering checkmate and concluding the game.`
    } else if (isMissedMate) {
      whatHappened = `${playerRef} played ${playedSan}, overlooking a direct forced-mate opportunity found by Stockfish.`
    } else if (isAllowedMate) {
      whatHappened = `${playerRef} played ${playedSan}, allowing ${oppRef} a forcing sequence leading to checkmate.`
    } else if (isBest) {
      if (isCapture) {
        whatHappened = `${playerRef} played ${playedSan}, capturing material with optimal tactical precision.`
      } else if (isCheck) {
        whatHappened = `${playerRef} played ${playedSan}, delivering an active check that maintains maximum initiative.`
      } else if (isCastling) {
        whatHappened = `${playerRef} castled (${playedSan}), securing the king and activating the rook.`
      } else {
        whatHappened = `${playerRef} played ${playedSan}, executing the strongest move calculated by Stockfish.`
      }
    } else if (isBlunder) {
      whatHappened = `${playerRef} played ${playedSan}, a severe tactical blunder conceding ${move.cpl ?? 100} centipawns of evaluation to ${oppRef}.`
    } else if (isMistake) {
      whatHappened = `${playerRef} played ${playedSan}, conceding ${move.cpl ?? 50} centipawns and shifting the advantage toward ${oppRef}.`
    } else if (isInaccuracy) {
      whatHappened = `${playerRef} played ${playedSan}, a minor inaccuracy conceding ${move.cpl ?? 20} centipawns compared to the optimal line.`
    } else {
      whatHappened = `${playerRef} played ${playedSan}.`
    }
  }

  const betterMoveSan = !isBest && move.best_move_san ? move.best_move_san : null
  let whyBetter = ''

  if (isBest) {
    whyBetter = `${playedSan} is the premier engine continuation in this position, preserving optimal tactical and positional balance.`
  } else if (betterMoveSan) {
    const betterIsCheck = betterMoveSan.includes('+')
    const betterIsCheckmate = betterMoveSan.includes('#')
    const betterIsCapture = betterMoveSan.includes('x')
    const betterIsCastling = betterMoveSan.startsWith('O-O')

    if (betterIsCheckmate) {
      whyBetter = `Stockfish recommends ${betterMoveSan}, which forces immediate checkmate against the opposing king.`
    } else if (betterIsCapture) {
      whyBetter = `Stockfish prefers ${betterMoveSan} to capture material with tactical advantage, saving ${move.cpl ?? 50} centipawns compared to ${playedSan}.`
    } else if (betterIsCheck) {
      whyBetter = `Stockfish recommends ${betterMoveSan} with check, keeping the initiative and putting immediate pressure on the opposing king.`
    } else if (betterIsCastling) {
      whyBetter = `Stockfish prioritizes ${betterMoveSan} to bring the king to safety and connect the rooks.`
    } else if (move.move_number <= 5) {
      whyBetter = `In the opening, Stockfish prefers ${betterMoveSan} to control central squares and speed up minor piece development.`
    } else {
      whyBetter = `Stockfish calculates that ${betterMoveSan} preserves ${move.cpl ?? 30} centipawns of evaluation, keeping active piece coordination.`
    }
  } else {
    whyBetter = 'The position is tactically complex; focus on active pieces and king safety.'
  }

  let lesson = ''
  if (isMissedMate) {
    lesson = 'Whenever you have the opponent’s king cornered, look closely at all forcing checks and mating nets before quiet moves.'
  } else if (isAllowedMate) {
    lesson = 'Before committing a move under pressure, verify all of your opponent’s immediate checks and direct attacks.'
  } else if (isBlunder) {
    lesson = 'Always scan for undefended pieces and check forcing opponent replies (Checks, Captures, and Threats) before finalizing your move.'
  } else if (isMistake) {
    lesson = 'Before committing pawn thrusts or moving a piece, verify which squares or defenders you are leaving behind.'
  } else if (isInaccuracy) {
    lesson = 'When evaluating candidate moves, favor the one that improves your least active piece or consolidates central control.'
  } else {
    lesson = 'Great tactical discipline! Keep maintaining harmony and calculating forcing lines.'
  }

  return { whatHappened, betterMoveSan, whyBetter, lesson }
}

export function GameReportPage() {
  const { id: gameId } = useParams<{ id: string }>()
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)

  // Top Workspace Tab: 'report' | 'moves' | 'coach'
  const [activeTab, setActiveTab] = useState<'report' | 'moves' | 'coach'>('report')

  // Replay board state
  const [activePlyIndex, setActivePlyIndex] = useState<number>(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [boardFlipped, setBoardFlipped] = useState(false)
  const [showBetterMoveOnBoard, setShowBetterMoveOnBoard] = useState(false)
  const [filterMode, setFilterMode] = useState<'all' | 'mine' | 'opponent' | 'mistakes'>('all')
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchReport = async (silent = false) => {
    if (!gameId) return
    if (!silent) setLoading(true)
    setError(null)
    try {
      const data = await getPerformanceReport(gameId)
      setReport(data)
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Unable to load game performance report')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }

  useEffect(() => {
    void fetchReport(false)
  }, [gameId])

  // Polling when analysis is queued or processing
  useEffect(() => {
    if (!report) return
    if (report.analysis_status === 'queued' || report.analysis_status === 'processing') {
      const timer = setInterval(() => {
        void fetchReport(true)
      }, 2500)
      return () => clearInterval(timer)
    }
  }, [report?.analysis_status, gameId])

  const handleRetryAnalysis = async () => {
    if (!gameId) return
    setRetrying(true)
    try {
      const updated = await triggerGameAnalysis(gameId)
      setReport(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not trigger analysis')
    } finally {
      setRetrying(false)
    }
  }

  const moves: MoveAnalysisItem[] = useMemo(() => report?.moves || [], [report?.moves])

  // Filtered moves for navigation tab
  const displayedMoves = useMemo(() => {
    if (filterMode === 'mine') return moves.filter(m => m.is_user_move)
    if (filterMode === 'opponent') return moves.filter(m => !m.is_user_move)
    if (filterMode === 'mistakes') {
      return moves.filter(
        m => m.classification === 'mistake' || m.classification === 'blunder' || m.classification === 'missed_forced_mate' || m.classification === 'allowed_forced_mate'
      )
    }
    return moves
  }, [moves, filterMode])

  // Active move item
  const activeMove: MoveAnalysisItem | null = useMemo(() => {
    if (moves.length === 0) return null
    const clamped = Math.max(0, Math.min(activePlyIndex, moves.length - 1))
    return moves[clamped] || null
  }, [moves, activePlyIndex])

  // Auto-stepping interval
  useEffect(() => {
    if (isPlaying && moves.length > 0) {
      playTimerRef.current = setInterval(() => {
        setActivePlyIndex(curr => {
          if (curr >= moves.length - 1) {
            setIsPlaying(false)
            return curr
          }
          return curr + 1
        })
      }, 1600)
    } else if (playTimerRef.current) {
      clearInterval(playTimerRef.current)
      playTimerRef.current = null
    }
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [isPlaying, moves.length])

  // Board position: render fen_after of current move, or start fen if ply is 0
  const currentBoard = useMemo(() => {
    if (!activeMove) return new Chess()
    try {
      return new Chess(activeMove.fen_after)
    } catch {
      return new Chess()
    }
  }, [activeMove])

  // Highlight squares from played UCI
  const highlightedSquares = useMemo(() => {
    if (!activeMove || !activeMove.played_uci) return new Set<string>()
    const uci = activeMove.played_uci
    if (uci.length >= 4) {
      return new Set([uci.slice(0, 2), uci.slice(2, 4)])
    }
    return new Set<string>()
  }, [activeMove])

  // Recommended square highlight when previewing best move
  const bestMoveSquares = useMemo(() => {
    if (!showBetterMoveOnBoard || !activeMove || !activeMove.best_move_uci) return new Set<string>()
    const uci = activeMove.best_move_uci
    if (uci.length >= 4) {
      return new Set([uci.slice(0, 2), uci.slice(2, 4)])
    }
    return new Set<string>()
  }, [showBetterMoveOnBoard, activeMove])

  // Critical moments (CPL >= 50 or forced mate errors)
  const criticalMoments = useMemo(() => {
    return moves.filter(
      m => (m.cpl !== null && m.cpl !== undefined && m.cpl >= 50) || m.classification === 'blunder' || m.classification === 'missed_forced_mate' || m.classification === 'allowed_forced_mate'
    )
  }, [moves])

  const coachInsights = useMemo(() => getCoachInsights(activeMove), [activeMove])

  if (loading && !report) {
    return (
      <div className="page-wrap report-page" style={{ padding: '40px 24px', textAlign: 'center' }}>
        <div className="loading-spinner-wrap" style={{ margin: '60px auto' }}>
          <div className="loading-pulse" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--color-lime)' }} />
          <h2 style={{ marginTop: '20px' }}>Loading Game Report…</h2>
          <p style={{ color: 'var(--color-muted)' }}>Retrieving saved match analysis and performance metrics…</p>
        </div>
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="page-wrap report-page" style={{ padding: '40px 24px' }}>
        <div className="panel" role="alert" style={{ maxWidth: '640px', margin: '40px auto', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--color-red)' }}>Unable to Open Report</h2>
          <p style={{ margin: '16px 0', color: 'var(--color-muted)' }}>{error}</p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '24px' }}>
            <Link to="/history" className="secondary-action">
              ← Back to Game History
            </Link>
            <button type="button" className="primary-action" onClick={() => void fetchReport(false)}>
              Retry Loading
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!report) return null

  const isQueuedOrProcessing = report.analysis_status === 'queued' || report.analysis_status === 'processing'
  const isFailed = report.analysis_status === 'failed'

  const userWon = report.user_won
  const resultOutcome = report.result_outcome || (userWon === true ? 'win' : userWon === false ? 'loss' : 'draw')
  const myColor = report.color || 'white'
  const oppColor = myColor === 'white' ? 'black' : 'white'
  const isWhiteOrientation = boardFlipped ? myColor === 'black' : myColor === 'white'

  // Evaluation bar height ratio (White advantage vs Black advantage)
  let evalPawnScore = 0
  if (activeMove?.played_score_mate !== null && activeMove?.played_score_mate !== undefined) {
    const mateScore = activeMove.color === 'white' ? activeMove.played_score_mate : -activeMove.played_score_mate
    evalPawnScore = mateScore > 0 ? 8.0 : -8.0
  } else if (activeMove?.played_score_cp !== null && activeMove?.played_score_cp !== undefined) {
    const cpScore = activeMove.color === 'white' ? activeMove.played_score_cp : -activeMove.played_score_cp
    evalPawnScore = cpScore / 100.0
  }
  // Convert -6.0 to +6.0 pawns into 0% to 100% white height
  const whiteHeightPct = Math.max(5, Math.min(95, 50 + (evalPawnScore / 12) * 100))

  return (
    <div className="page-wrap report-page" style={{ paddingBottom: '60px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* SECTION 1: Top Navigation & Match Header */}
      <div className="analysis-workspace-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <Link to="/history" className="secondary-action" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 14px' }}>
            <span>← Back to Game History</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: resultOutcome === 'win' ? 'rgba(180, 243, 0, 0.15)' : resultOutcome === 'loss' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                color: resultOutcome === 'win' ? 'var(--color-lime)' : resultOutcome === 'loss' ? 'var(--color-red)' : 'var(--color-text)',
                border: `1px solid ${resultOutcome === 'win' ? 'var(--color-lime-border)' : resultOutcome === 'loss' ? 'rgba(239, 68, 68, 0.4)' : 'var(--color-border)'}`,
                padding: '4px 12px',
                borderRadius: '16px',
                fontWeight: 800,
                fontSize: '12px',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
              }}
            >
              {resultOutcome === 'win' ? 'Victory' : resultOutcome === 'loss' ? 'Defeat' : 'Draw'}
            </span>

            <span style={{ fontSize: '14px', fontWeight: 600 }}>
              vs <strong>{report.opponent_username || report.opponent_report?.username || 'Opponent'}</strong>
            </span>

            <span style={{ color: 'var(--color-muted)', fontSize: '13px' }}>
              ({report.is_rated ? 'Rated' : 'Casual'} · {report.termination || 'conclusion'})
            </span>

            {report.is_rated && report.rating_change !== null && report.rating_change !== undefined && (
              <span style={{ color: report.rating_change >= 0 ? 'var(--color-lime)' : 'var(--color-red)', fontWeight: 700, fontSize: '13px' }}>
                {report.rating_change >= 0 ? `+${report.rating_change}` : report.rating_change}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: 'var(--color-muted)', fontSize: '12px' }}>
          <span>
            {report.finished_at
              ? new Date(report.finished_at).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Recent Match'}
          </span>
          <span>•</span>
          <span>Duration: {formatDuration(report.duration_seconds)} ({report.move_count} plies)</span>
        </div>
      </div>

      {/* Analysis Status Banner if queued or processing */}
      {isQueuedOrProcessing && (
        <div
          className="panel"
          role="region"
          aria-label="Analysis Queued"
          style={{
            marginBottom: '20px',
            borderColor: 'var(--color-cyan)',
            background: 'rgba(0, 240, 255, 0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 20px',
            flexWrap: 'wrap',
          }}
        >
          <div className="loading-pulse" style={{ width: '14px', height: '14px', borderRadius: '50%', background: 'var(--color-cyan)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: '240px' }}>
            <strong style={{ color: 'var(--color-cyan)', display: 'block', fontSize: '14px' }}>
              Analysis {report.analysis_status === 'queued' ? 'Queued' : 'Processing…'}
            </strong>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Waiting for Stockfish analysis worker to complete move evaluations and accuracy calculation.
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="primary-action"
              onClick={() => void handleRetryAnalysis()}
              disabled={retrying}
              style={{ fontSize: '12px', padding: '6px 14px' }}
            >
              {retrying ? 'Triggering…' : 'Request Analysis Now'}
            </button>
            <button
              type="button"
              className="secondary-action"
              onClick={() => void fetchReport(false)}
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              Refresh Now
            </button>
          </div>
        </div>
      )}

      {isFailed && (
        <div
          className="panel"
          style={{
            marginBottom: '20px',
            borderColor: 'var(--color-red)',
            background: 'rgba(239, 68, 68, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '14px 20px',
          }}
        >
          <div style={{ fontSize: '22px' }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <strong style={{ color: 'var(--color-red)', display: 'block', fontSize: '14px' }}>Analysis Unavailable</strong>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              {report.message || 'The post-game analysis job could not complete. You can retry running Stockfish evaluation.'}
            </span>
          </div>
          <button
            type="button"
            className="primary-action"
            onClick={() => void handleRetryAnalysis()}
            disabled={retrying}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {retrying ? 'Retrying…' : 'Retry Analysis'}
          </button>
        </div>
      )}

      {/* SECTION 2: Two-Column Analysis Workspace */}
      <div className="analysis-workspace-grid">
        {/* ================= LEFT COLUMN: Prominent Interactive Chessboard ================= */}
        <div className="board-stage-wrapper">
          {/* Top Opponent Strip */}
          <div className="player-match-strip">
            <div className="player-strip-left">
              <div
                className="player-avatar-circle"
                style={{
                  background: oppColor === 'white' ? '#fff' : '#1e2631',
                  color: oppColor === 'white' ? '#000' : '#fff',
                  border: '1px solid var(--color-border)',
                }}
              >
                {oppColor === 'white' ? '♔' : '♚'}
              </div>
              <div>
                <strong style={{ fontSize: '13px' }}>
                  {report.opponent_username || report.opponent_report?.username || 'Opponent'}
                </strong>
                <span className="text-muted" style={{ fontSize: '12px', marginLeft: '6px' }}>
                  ({report.opponent_rating ? report.opponent_rating : '1240'})
                </span>
              </div>
            </div>

            {report.opponent_report?.accuracy_pct !== null && report.opponent_report?.accuracy_pct !== undefined && (
              <span
                className="player-accuracy-badge"
                style={{ background: 'rgba(0, 240, 255, 0.12)', color: 'var(--color-cyan)', border: '1px solid rgba(0, 240, 255, 0.3)' }}
              >
                Acc {report.opponent_report.accuracy_pct.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Chessboard with Side Evaluation Bar */}
          <div className="board-container-with-eval">
            {/* Native Vertical Evaluation Bar */}
            <div className="vertical-eval-bar" title={`Evaluation: ${evalPawnScore >= 0 ? '+' : ''}${evalPawnScore.toFixed(2)} pawns`}>
              <div className="vertical-eval-fill-white" style={{ height: `${whiteHeightPct}%` }} />
              <span className="vertical-eval-text">
                {evalPawnScore >= 0 ? `+${evalPawnScore.toFixed(1)}` : evalPawnScore.toFixed(1)}
              </span>
            </div>

            {/* Square Responsive Chessboard */}
            <div className="workspace-chessboard-wrap">
              <div className="chessboard demo-chessboard" style={{ width: '100%', height: '100%', margin: 0 }}>
                {(isWhiteOrientation ? currentBoard.board() : currentBoard.board().slice().reverse().map(row => row.slice().reverse())).map((rank, rowIdx) => {
                  const displayRow = isWhiteOrientation ? rowIdx : 7 - rowIdx
                  return (
                    <div className="board-rank" key={displayRow}>
                      {rank.map((piece, colIdx) => {
                        const displayCol = isWhiteOrientation ? colIdx : 7 - colIdx
                        const square = `${files[displayCol]}${8 - displayRow}` as Square
                        const isHighlighted = highlightedSquares.has(square)
                        const isBestHighlight = bestMoveSquares.has(square)

                        return (
                          <div
                            key={square}
                            className={`board-square ${(displayRow + displayCol) % 2 === 0 ? 'board-square--light' : 'board-square--dark'} ${
                              isHighlighted ? 'is-highlighted-move' : ''
                            }`}
                            style={{
                              position: 'relative',
                              outline: isBestHighlight ? '2px dashed var(--color-cyan)' : undefined,
                              outlineOffset: '-2px',
                            }}
                          >
                            {piece && (
                              <span className={`chess-piece chess-piece--${piece.color}`}>
                                {symbols[`${piece.color}${piece.type}`]}
                              </span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Bottom Player Strip */}
          <div className="player-match-strip">
            <div className="player-strip-left">
              <div
                className="player-avatar-circle"
                style={{
                  background: myColor === 'white' ? '#fff' : '#1e2631',
                  color: myColor === 'white' ? '#000' : '#fff',
                  border: '1px solid var(--color-border)',
                }}
              >
                {myColor === 'white' ? '♔' : '♚'}
              </div>
              <div>
                <strong style={{ fontSize: '13px' }}>You</strong>
                <span className="text-muted" style={{ fontSize: '12px', marginLeft: '6px' }}>
                  ({report.user_rating ?? 1200})
                </span>
                {report.is_rated && report.rating_change !== null && report.rating_change !== undefined && (
                  <span
                    style={{
                      marginLeft: '6px',
                      color: report.rating_change >= 0 ? 'var(--color-lime)' : 'var(--color-red)',
                      fontWeight: 700,
                      fontSize: '12px',
                    }}
                  >
                    {report.rating_change >= 0 ? `+${report.rating_change}` : report.rating_change}
                  </span>
                )}
              </div>
            </div>

            {report.accuracy_pct !== null && report.accuracy_pct !== undefined && (
              <span
                className="player-accuracy-badge"
                style={{ background: 'rgba(180, 243, 0, 0.15)', color: 'var(--color-lime)', border: '1px solid var(--color-lime-border)' }}
              >
                Acc {report.accuracy_pct.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Replay Controls Toolbar */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 14px',
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                className="secondary-action"
                onClick={() => { setIsPlaying(false); setActivePlyIndex(0) }}
                disabled={activePlyIndex === 0 || moves.length === 0}
                aria-label="First move"
                title="First move"
                style={{ padding: '6px 10px' }}
              >
                ⏮
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => { setIsPlaying(false); setActivePlyIndex(p => Math.max(0, p - 1)) }}
                disabled={activePlyIndex === 0 || moves.length === 0}
                aria-label="Previous move"
                title="Previous move"
                style={{ padding: '6px 12px' }}
              >
                ◀
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setIsPlaying(p => !p)}
                disabled={moves.length === 0}
                aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
                title={isPlaying ? 'Pause replay' : 'Play replay'}
                style={{ padding: '6px 14px', fontWeight: 700 }}
              >
                {isPlaying ? '⏸ Pause' : '▶ Play'}
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => { setIsPlaying(false); setActivePlyIndex(p => Math.min(moves.length - 1, p + 1)) }}
                disabled={activePlyIndex >= moves.length - 1 || moves.length === 0}
                aria-label="Next move"
                title="Next move"
                style={{ padding: '6px 12px' }}
              >
                ▶
              </button>
              <button
                type="button"
                className="secondary-action"
                onClick={() => { setIsPlaying(false); setActivePlyIndex(moves.length - 1) }}
                disabled={activePlyIndex >= moves.length - 1 || moves.length === 0}
                aria-label="Last move"
                title="Last move"
                style={{ padding: '6px 10px' }}
              >
                ⏭
              </button>
            </div>

            {/* Move counter */}
            <div style={{ fontSize: '13px', color: 'var(--color-muted)', fontWeight: 600 }}>
              {activeMove
                ? `Move ${activeMove.move_number} of ${Math.ceil(moves.length / 2)} (Ply ${activeMove.ply})`
                : 'Initial Position'}
            </div>

            <button
              type="button"
              className="secondary-action"
              onClick={() => setBoardFlipped(f => !f)}
              title="Flip Board Orientation"
              style={{ padding: '6px 10px' }}
            >
              ⇅ Flip
            </button>
          </div>
        </div>

        {/* ================= RIGHT COLUMN: Tabbed Analysis Workspace ================= */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Tab Selection Bar */}
          <nav className="analysis-tab-bar" aria-label="Game analysis tabs">
            <button
              type="button"
              className={`analysis-tab-btn ${activeTab === 'report' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('report')}
            >
              📊 Report
            </button>
            <button
              type="button"
              className={`analysis-tab-btn ${activeTab === 'moves' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('moves')}
            >
              ♟ Moves ({moves.length})
            </button>
            <button
              type="button"
              className={`analysis-tab-btn ${activeTab === 'coach' ? 'is-active' : ''}`}
              onClick={() => setActiveTab('coach')}
            >
              🎓 Coach
            </button>
          </nav>

          {/* TAB 1: REPORT & ANALYTICS */}
          {activeTab === 'report' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Performance Stars Card */}
              <div className="stars-rating-container" title={report.star_reason || 'Performance Star Eligibility'}>
                <div className="star-glyphs" aria-label={`${report.stars ?? 0} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map(starNum => {
                    const isFilled = report.stars !== null && report.stars !== undefined && starNum <= report.stars
                    return (
                      <span key={starNum} className={isFilled ? 'star-glyph-filled' : 'star-glyph-empty'}>
                        {isFilled ? '★' : '☆'}
                      </span>
                    )
                  })}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <strong style={{ fontSize: '15px' }}>
                      {report.stars !== null && report.stars !== undefined ? `${report.stars} out of 5 stars` : 'Performance Stars Unavailable'}
                    </strong>
                  </div>
                  <small style={{ color: 'var(--color-muted)', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                    {report.star_reason || 'Requires at least 8 centipawn-evaluable moves to calculate star tier.'}
                  </small>
                </div>
              </div>

              {/* Head-to-Head Tactical Comparison Card */}
              {report.opponent_report && (
                <div className="panel" style={{ padding: '16px' }}>
                  <h3 style={{ margin: '0 0 10px 0', fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                    Head-to-Head Tactical Comparison
                  </h3>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', marginBottom: '6px' }}>
                    <span>
                      You ({myColor}): <strong style={{ color: 'var(--color-lime)' }}>{report.accuracy_pct !== null && report.accuracy_pct !== undefined ? `${report.accuracy_pct.toFixed(1)}%` : '—'}</strong>
                    </span>
                    <span>
                      {report.opponent_username} ({oppColor}): <strong style={{ color: 'var(--color-cyan)' }}>{report.opponent_report.accuracy_pct !== null && report.opponent_report.accuracy_pct !== undefined ? `${report.opponent_report.accuracy_pct.toFixed(1)}%` : '—'}</strong>
                    </span>
                  </div>

                  {/* Dual comparison bar */}
                  <div style={{ height: '8px', display: 'flex', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden', marginBottom: '12px' }}>
                    <div style={{ width: `${report.accuracy_pct || 50}%`, background: 'var(--color-lime)' }} />
                    <div style={{ width: `${report.opponent_report.accuracy_pct || 50}%`, background: 'var(--color-cyan)', opacity: 0.8 }} />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '12px', background: 'var(--color-surface-raised)', padding: '10px', borderRadius: '8px' }}>
                    <div>
                      <span className="text-muted" style={{ display: 'block', fontSize: '11px' }}>Your Faults</span>
                      <strong>{report.blunders ?? 0}</strong> Blunders · <strong>{report.mistakes ?? 0}</strong> Mistakes
                    </div>
                    <div>
                      <span className="text-muted" style={{ display: 'block', fontSize: '11px' }}>Opponent Faults</span>
                      <strong>{report.opponent_report.blunders ?? 0}</strong> Blunders · <strong>{report.opponent_report.mistakes ?? 0}</strong> Mistakes
                    </div>
                  </div>
                </div>
              )}

              {/* 4 Summary Scorecards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="panel" style={{ padding: '14px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
                    Estimated Accuracy
                  </span>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-lime)', margin: '4px 0' }}>
                    {report.accuracy_pct !== null && report.accuracy_pct !== undefined
                      ? report.accuracy_pct > 0 && report.accuracy_pct < 0.1
                        ? '<0.1%'
                        : `${report.accuracy_pct.toFixed(1)}%`
                      : '—'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    Formula: 100 × exp(-CPL/100)
                  </span>
                </div>

                <div className="panel" style={{ padding: '14px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
                    Average Centipawn Loss
                  </span>
                  <div style={{ fontSize: '26px', fontWeight: 800, margin: '4px 0' }}>
                    {report.average_cpl !== null && report.average_cpl !== undefined ? (
                      <span>{report.average_cpl.toFixed(1)} <small style={{ fontSize: '12px', fontWeight: 400 }}>cp</small></span>
                    ) : '—'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    Lower loss is better
                  </span>
                </div>

                <div className="panel" style={{ padding: '14px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
                    Best Move Agreement
                  </span>
                  <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-cyan)', margin: '4px 0' }}>
                    {report.best_move_agreement_pct !== null && report.best_move_agreement_pct !== undefined ? `${report.best_move_agreement_pct.toFixed(0)}%` : '—'}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    Matched Stockfish top line
                  </span>
                </div>

                <div className="panel" style={{ padding: '14px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
                    Tactical Faults
                  </span>
                  <div style={{ display: 'flex', gap: '8px', margin: '4px 0', alignItems: 'baseline' }}>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: 'var(--color-red)' }}>{report.blunders ?? 0} <small style={{ fontSize: '10px', color: 'var(--color-muted)' }}>B</small></span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#fb923c' }}>{report.mistakes ?? 0} <small style={{ fontSize: '10px', color: 'var(--color-muted)' }}>M</small></span>
                    <span style={{ fontSize: '20px', fontWeight: 700, color: '#facc15' }}>{report.inaccuracies ?? 0} <small style={{ fontSize: '10px', color: 'var(--color-muted)' }}>I</small></span>
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                    Inacc &gt;10 · Mist &ge;50 · Blund &ge;100
                  </span>
                </div>
              </div>

              {/* Evaluation Swing Graph (Centipawns) */}
              <div className="panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <h4 style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                    Position Evaluation (White's Point of View)
                  </h4>
                  <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>+ White / − Black</span>
                </div>

                <div style={{ width: '100%', height: '140px', position: 'relative' }}>
                  {(() => {
                    const width = 460
                    const height = 130
                    const padding = 20
                    const usableW = width - padding * 2
                    const usableH = height - padding * 2
                    const zeroY = padding + usableH / 2

                    const points = moves.map((m, idx) => {
                      const x = padding + (idx / Math.max(1, moves.length - 1)) * usableW
                      let evalPawn = 0
                      if (m.played_score_mate !== null && m.played_score_mate !== undefined) {
                        const mateScore = m.color === 'white' ? m.played_score_mate : -m.played_score_mate
                        evalPawn = mateScore > 0 ? 6.0 : -6.0
                      } else if (m.played_score_cp !== null && m.played_score_cp !== undefined) {
                        const cpScore = m.color === 'white' ? m.played_score_cp : -m.played_score_cp
                        evalPawn = cpScore / 100.0
                      }
                      const clamped = Math.max(-5.0, Math.min(5.0, evalPawn))
                      const y = zeroY - (clamped / 5.0) * (usableH / 2)
                      return { x, y, ply: m.ply, evalPawn }
                    })

                    const pathD = points.length > 0 ? points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') : ''
                    const currentPoint = points[activePlyIndex]

                    return (
                      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: '100%' }}>
                        <line x1={padding} y1={zeroY} x2={width - padding} y2={zeroY} stroke="var(--color-border-bright)" strokeWidth="1" strokeDasharray="3 3" />
                        {points.length > 0 && (
                          <path d={`${pathD} L ${points[points.length - 1].x} ${zeroY} L ${points[0].x} ${zeroY} Z`} fill="rgba(180, 243, 0, 0.08)" />
                        )}
                        {points.length > 0 && (
                          <path d={pathD} fill="none" stroke="var(--color-lime)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        )}
                        {currentPoint && (
                          <circle cx={currentPoint.x} cy={currentPoint.y} r="4" fill="var(--color-cyan)" stroke="#fff" strokeWidth="1.5" />
                        )}
                      </svg>
                    )
                  })()}
                </div>
              </div>

              {/* Move Classification Breakdown */}
              <div className="panel" style={{ padding: '16px' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                  Your Move Classification Breakdown
                </h4>
                {(() => {
                  const userMoves = moves.filter(m => m.is_user_move)
                  const bestCount = userMoves.filter(m => m.classification === 'best_or_near_best').length
                  const inaccCount = userMoves.filter(m => m.classification === 'inaccuracy').length
                  const mistCount = userMoves.filter(m => m.classification === 'mistake').length
                  const blundCount = userMoves.filter(m => m.classification === 'blunder').length
                  const total = Math.max(1, userMoves.length)

                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ height: '10px', display: 'flex', borderRadius: '5px', overflow: 'hidden', background: 'var(--color-surface-raised)' }}>
                        <div style={{ width: `${(bestCount / total) * 100}%`, background: 'var(--color-lime)' }} title={`Best: ${bestCount}`} />
                        <div style={{ width: `${(inaccCount / total) * 100}%`, background: '#facc15' }} title={`Inaccuracies: ${inaccCount}`} />
                        <div style={{ width: `${(mistCount / total) * 100}%`, background: '#fb923c' }} title={`Mistakes: ${mistCount}`} />
                        <div style={{ width: `${(blundCount / total) * 100}%`, background: 'var(--color-red)' }} title={`Blunders: ${blundCount}`} />
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', fontSize: '11px', textAlign: 'center', marginTop: '4px' }}>
                        <div><strong style={{ color: 'var(--color-lime)' }}>{bestCount}</strong> <span className="text-muted">Best</span></div>
                        <div><strong style={{ color: '#facc15' }}>{inaccCount}</strong> <span className="text-muted">Inacc</span></div>
                        <div><strong style={{ color: '#fb923c' }}>{mistCount}</strong> <span className="text-muted">Mist</span></div>
                        <div><strong style={{ color: 'var(--color-red)' }}>{blundCount}</strong> <span className="text-muted">Blund</span></div>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Critical Moments Section */}
              {criticalMoments.length > 0 && (
                <div className="panel" style={{ padding: '16px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-muted)' }}>
                    Critical Moments ({criticalMoments.length})
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {criticalMoments.slice(0, 4).map(cm => (
                      <div
                        key={cm.ply}
                        onClick={() => {
                          const plyIdx = moves.findIndex(m => m.ply === cm.ply)
                          if (plyIdx !== -1) {
                            setActivePlyIndex(plyIdx)
                            setActiveTab('coach')
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          background: 'var(--color-surface-raised)',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                        title="Click to inspect this critical moment in Coach tab"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                          <span style={{ color: cm.classification === 'blunder' ? 'var(--color-red)' : '#fb923c', fontWeight: 700 }}>
                            {cm.classification === 'blunder' ? '🔴 Blunder' : '🟠 Mistake'}
                          </span>
                          <span>
                            Move {cm.move_number}.{cm.color === 'white' ? '' : '..'} <strong>{cm.played_san}</strong>
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--color-muted)' }}>
                          {cm.cpl ? `${cm.cpl} CPL` : 'Loss'} →
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Historical Preceding Match Comparison */}
              <div className="panel" style={{ padding: '16px' }}>
                <span className="eyebrow" style={{ color: 'var(--color-lime)', fontSize: '11px', display: 'block', marginBottom: '4px' }}>
                  CHRONOLOGICAL PRECEDING MATCH COMPARISON
                </span>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>
                  Historical Performance Trajectory
                </h4>

                {report.previous_game_comparison ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                    <div style={{ background: 'var(--color-surface-raised)', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
                      <span className="text-muted" style={{ fontSize: '11px', display: 'block' }}>Accuracy Change</span>
                      <strong style={{ fontSize: '16px', color: (report.previous_game_comparison.accuracy_delta ?? 0) >= 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
                        {report.previous_game_comparison.accuracy_delta !== null && report.previous_game_comparison.accuracy_delta !== undefined
                          ? `${report.previous_game_comparison.accuracy_delta >= 0 ? '+' : ''}${report.previous_game_comparison.accuracy_delta}%`
                          : 'N/A'}
                      </strong>
                    </div>

                    <div style={{ background: 'var(--color-surface-raised)', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
                      <span className="text-muted" style={{ fontSize: '11px', display: 'block' }}>CPL Change</span>
                      <strong style={{ fontSize: '16px', color: (report.previous_game_comparison.average_cpl_delta ?? 0) <= 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
                        {report.previous_game_comparison.average_cpl_delta !== null && report.previous_game_comparison.average_cpl_delta !== undefined
                          ? `${report.previous_game_comparison.average_cpl_delta > 0 ? '+' : ''}${report.previous_game_comparison.average_cpl_delta} cp`
                          : 'N/A'}
                      </strong>
                    </div>

                    <div style={{ background: 'var(--color-surface-raised)', padding: '10px', borderRadius: '6px', border: '1px solid var(--color-border-subtle)' }}>
                      <span className="text-muted" style={{ fontSize: '11px', display: 'block' }}>Blunder Delta</span>
                      <strong style={{ fontSize: '16px', color: (report.previous_game_comparison.blunders_delta ?? 0) <= 0 ? 'var(--color-lime)' : 'var(--color-red)' }}>
                        {report.previous_game_comparison.blunders_delta !== null && report.previous_game_comparison.blunders_delta !== undefined
                          ? `${report.previous_game_comparison.blunders_delta > 0 ? '+' : ''}${report.previous_game_comparison.blunders_delta}`
                          : 'N/A'}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--color-muted)' }}>
                    No earlier analyzed match found for this player. Play additional matchmaking games to unlock trajectory deltas.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: INTERACTIVE MOVES LIST */}
          {activeTab === 'moves' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="panel" style={{ padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ margin: 0, fontSize: '15px' }}>Move-by-Move Evaluation</h3>
                  <span className="text-muted" style={{ fontSize: '12px' }}>Click move to view</span>
                </div>

                {/* Filter buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  <button
                    type="button"
                    className={`demo-tab-button ${filterMode === 'all' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('all')}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    All Moves ({moves.length})
                  </button>
                  <button
                    type="button"
                    className={`demo-tab-button ${filterMode === 'mine' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('mine')}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    Your Moves ({moves.filter(m => m.is_user_move).length})
                  </button>
                  <button
                    type="button"
                    className={`demo-tab-button ${filterMode === 'opponent' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('opponent')}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    Opponent ({moves.filter(m => !m.is_user_move).length})
                  </button>
                  <button
                    type="button"
                    className={`demo-tab-button ${filterMode === 'mistakes' ? 'is-active' : ''}`}
                    onClick={() => setFilterMode('mistakes')}
                    style={{ padding: '4px 10px', fontSize: '11px' }}
                  >
                    Mistakes ({moves.filter(m => m.classification === 'mistake' || m.classification === 'blunder' || m.classification === 'missed_forced_mate' || m.classification === 'allowed_forced_mate').length})
                  </button>
                </div>

                {/* Scrollable Move Table */}
                <div style={{ maxHeight: '420px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                  <table className="history-table" style={{ width: '100%', margin: 0, fontSize: '13px' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-surface-hover)' }}>
                        <th style={{ width: '40px', padding: '8px' }}>#</th>
                        <th style={{ width: '70px', padding: '8px' }}>Played</th>
                        <th style={{ width: '80px', padding: '8px' }}>Stockfish</th>
                        <th style={{ width: '60px', padding: '8px' }}>CPL</th>
                        <th style={{ padding: '8px' }}>Classification</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedMoves.map(m => {
                        const isSelected = activeMove?.ply === m.ply
                        const cls = formatClassification(m.classification)
                        return (
                          <tr
                            key={m.ply}
                            onClick={() => { setIsPlaying(false); setActivePlyIndex(m.ply - 1) }}
                            style={{
                              cursor: 'pointer',
                              background: isSelected ? 'rgba(180, 243, 0, 0.12)' : undefined,
                              borderLeft: isSelected ? '3px solid var(--color-lime)' : '3px solid transparent',
                            }}
                          >
                            <td style={{ padding: '8px', color: 'var(--color-muted)' }}>
                              {m.move_number}.{m.color === 'white' ? '' : '..'}
                            </td>
                            <td style={{ padding: '8px', fontWeight: 600 }}>{m.played_san}</td>
                            <td style={{ padding: '8px', color: 'var(--color-lime)' }}>{m.best_move_san || '—'}</td>
                            <td style={{ padding: '8px' }}>
                              {m.cpl !== null && m.cpl !== undefined ? (
                                <span style={{ color: m.cpl >= 100 ? 'var(--color-red)' : m.cpl >= 50 ? '#fb923c' : 'var(--color-muted)' }}>
                                  {m.cpl}
                                </span>
                              ) : '—'}
                            </td>
                            <td style={{ padding: '8px' }}>
                              <span
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 6px',
                                  borderRadius: '4px',
                                  background: m.classification === 'blunder' ? 'rgba(239, 68, 68, 0.2)' : m.classification === 'mistake' ? 'rgba(251, 146, 60, 0.2)' : m.classification === 'inaccuracy' ? 'rgba(250, 204, 21, 0.2)' : m.classification === 'best_or_near_best' ? 'rgba(180, 243, 0, 0.2)' : 'var(--color-surface-hover)',
                                  color: m.classification === 'blunder' ? 'var(--color-red)' : m.classification === 'mistake' ? '#fb923c' : m.classification === 'inaccuracy' ? '#facc15' : m.classification === 'best_or_near_best' ? 'var(--color-lime)' : 'var(--color-muted)',
                                }}
                              >
                                {cls.icon} {cls.label}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BEGINNER-FRIENDLY COACH */}
          {activeTab === 'coach' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="coach-insight-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>🎓</span>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '15px' }}>Stockfish Coach's Take</h3>
                      <small style={{ color: 'var(--color-muted)' }}>
                        {activeMove ? `Move ${activeMove.move_number}.${activeMove.color === 'white' ? '' : '..'} ${activeMove.played_san}` : 'Initial Position'}
                      </small>
                    </div>
                  </div>

                  {activeMove && (() => {
                    const cls = formatClassification(activeMove.classification)
                    return (
                      <span
                        style={{
                          fontSize: '11px',
                          padding: '3px 8px',
                          borderRadius: '12px',
                          background: activeMove.classification === 'blunder' ? 'rgba(239, 68, 68, 0.2)' : activeMove.classification === 'mistake' ? 'rgba(251, 146, 60, 0.2)' : 'rgba(180, 243, 0, 0.2)',
                          color: activeMove.classification === 'blunder' ? 'var(--color-red)' : activeMove.classification === 'mistake' ? '#fb923c' : 'var(--color-lime)',
                          fontWeight: 700,
                        }}
                      >
                        {cls.icon} {cls.label}
                      </span>
                    )
                  })()}
                </div>

                {/* 1. What happened? */}
                <div style={{ marginBottom: '14px' }}>
                  <div className="coach-section-label">
                    <span>1. What happened?</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>
                    {coachInsights.whatHappened}
                  </p>
                </div>

                {/* 2. Better move */}
                <div style={{ marginBottom: '14px', background: 'var(--color-surface-raised)', padding: '12px', borderRadius: '8px', border: '1px solid var(--color-border-subtle)' }}>
                  <div className="coach-section-label">
                    <span>2. Engine Recommendation</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Recommended: </span>
                      <strong style={{ fontSize: '16px', color: 'var(--color-lime)' }}>
                        {coachInsights.betterMoveSan || activeMove?.played_san || 'None'}
                      </strong>
                    </div>
                    {coachInsights.betterMoveSan && (
                      <button
                        type="button"
                        className="secondary-action"
                        onClick={() => setShowBetterMoveOnBoard(s => !s)}
                        style={{ fontSize: '11px', padding: '4px 10px' }}
                      >
                        {showBetterMoveOnBoard ? 'Hide Better Move' : 'Highlight on Board'}
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Why is it better? */}
                <div style={{ marginBottom: '14px' }}>
                  <div className="coach-section-label">
                    <span>3. Why is it better?</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: 'var(--color-text)' }}>
                    {coachInsights.whyBetter}
                  </p>
                </div>

                {/* 4. Lesson to remember */}
                <div style={{ background: 'rgba(180, 243, 0, 0.08)', padding: '12px 14px', borderRadius: '8px', border: '1px solid var(--color-lime-border)', marginBottom: '14px' }}>
                  <div className="coach-section-label" style={{ color: 'var(--color-lime)' }}>
                    <span>💡 Lesson to Remember</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--color-text)' }}>
                    {coachInsights.lesson}
                  </p>
                </div>

                {/* Technical details disclosure */}
                <details style={{ marginTop: '16px', borderTop: '1px solid var(--color-border)', paddingTop: '10px', fontSize: '12px' }}>
                  <summary style={{ cursor: 'pointer', color: 'var(--color-muted)', fontWeight: 600 }}>
                    Technical details
                  </summary>
                  <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', color: 'var(--color-muted)' }}>
                    <div>Centipawn loss: <strong style={{ color: 'var(--color-text)' }}>{activeMove?.cpl ?? 0} cp</strong></div>
                    <div>Engine depth: <strong style={{ color: 'var(--color-text)' }}>Depth {activeMove?.engine_depth ?? 10}</strong></div>
                    <div>Played move UCI: <code style={{ color: 'var(--color-text)' }}>{activeMove?.played_uci || '—'}</code></div>
                    <div>Stockfish best UCI: <code style={{ color: 'var(--color-text)' }}>{activeMove?.best_move_uci || '—'}</code></div>
                  </div>
                </details>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
