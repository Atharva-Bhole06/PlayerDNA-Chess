import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { ApiError, getChessRecommendation, getHealth } from '../api/client'
import type { ChessRecommendationResponse } from '../api/types'
import { MultiplayerGame } from './MultiplayerGame'

const files = 'abcdefgh'
const symbols: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' }
const initialChess = () => new Chess()

export function LiveChessPage() {
  const multiplayerId = new URLSearchParams(window.location.search).get('game')
  return multiplayerId ? <MultiplayerGame gameId={multiplayerId} /> : <LocalChessAnalysis />
}

function LocalChessAnalysis() {
  const [game, setGame] = useState(initialChess)
  const [selected, setSelected] = useState<Square | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [moveMessage, setMoveMessage] = useState('')
  const [analysis, setAnalysis] = useState<ChessRecommendationResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [engineStatus, setEngineStatus] = useState<'checking' | 'available' | 'unavailable' | 'unknown'>('checking')
  const gameRef = useRef(game)
  const analysisController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then(health => {
      if (!controller.signal.aborted) setEngineStatus(health.stockfish_available ? 'available' : 'unavailable')
    }).catch(() => { if (!controller.signal.aborted) setEngineStatus('unknown') })
    return () => { controller.abort(); analysisController.current?.abort() }
  }, [])

  const fen = game.fen()
  const legalDestinations = useMemo(() => selected ? new Set(game.moves({ square: selected, verbose: true }).map(move => move.to)) : new Set<Square>(), [game, selected])
  const status = describePosition(game)

  const cancelAnalysis = () => {
    analysisController.current?.abort()
    analysisController.current = null
    setAnalysisLoading(false)
  }

  const commitMove = (from: Square, to: Square, promotion?: PieceSymbol) => {
    const next = new Chess(gameRef.current.fen())
    try {
      next.move({ from, to, ...(promotion ? { promotion } : {}) })
      gameRef.current = next
      setGame(next)
      setSelected(null)
      setPendingPromotion(null)
      setMoveMessage('')
      cancelAnalysis()
      setAnalysis(null)
      setAnalysisError(null)
    } catch {
      setMoveMessage('That move is not legal in this position.')
      setPendingPromotion(null)
    }
  }

  const clickSquare = (square: Square) => {
    if (game.isGameOver() || pendingPromotion) return
    const chosenPiece = game.get(square)
    if (selected && legalDestinations.has(square)) {
      const move = game.moves({ square: selected, verbose: true }).find(candidate => candidate.to === square)
      if (move?.isPromotion()) setPendingPromotion({ from: selected, to: square })
      else commitMove(selected, square)
      return
    }
    if (chosenPiece?.color === game.turn()) {
      setSelected(square)
      setMoveMessage('')
      return
    }
    if (selected) setMoveMessage('That destination is not a legal move.')
    setSelected(null)
  }

  const resetBoard = () => {
    cancelAnalysis()
    const next = new Chess()
    gameRef.current = next
    setGame(next)
    setSelected(null)
    setPendingPromotion(null)
    setMoveMessage('')
    setAnalysis(null)
    setAnalysisError(null)
  }

  const analyzePosition = async (retryUnavailable = false) => {
    if (game.isGameOver() || analysisLoading || engineStatus === 'unavailable' && !retryUnavailable) return
    cancelAnalysis()
    const submittedFen = game.fen()
    const controller = new AbortController()
    analysisController.current = controller
    setAnalysis(null)
    setAnalysisError(null)
    setAnalysisLoading(true)
    try {
      const response = await getChessRecommendation(submittedFen, controller.signal)
      if (!controller.signal.aborted && gameRef.current.fen() === submittedFen) {
        setAnalysis(response)
        if (response.evaluation_type === 'terminal') setEngineStatus('available')
      }
    } catch (error) {
      if (!controller.signal.aborted && gameRef.current.fen() === submittedFen) {
        const apiError = error instanceof ApiError ? error : null
        if (apiError?.status === 503) setEngineStatus('unavailable')
        setAnalysisError(apiError?.status === 503
          ? 'Stockfish is unavailable. The board remains playable locally.'
          : apiError?.status === 504
            ? 'Stockfish analysis timed out. Try again in a moment.'
            : apiError?.status === 422
              ? 'The backend rejected this position as invalid.'
              : error instanceof Error ? error.message : 'Unable to analyze this position.')
      }
    } finally {
      if (!controller.signal.aborted) {
        setAnalysisLoading(false)
        if (analysisController.current === controller) analysisController.current = null
      }
    }
  }

  const refreshEngine = async () => {
    setEngineStatus('checking')
    try {
      const health = await getHealth()
      setEngineStatus(health.stockfish_available ? 'available' : 'unavailable')
      if (health.stockfish_available) setAnalysisError(null)
    } catch {
      setEngineStatus('unknown')
    }
  }

  const retryAnalysis = async () => {
    if (engineStatus === 'unavailable') {
      setEngineStatus('checking')
      try {
        const health = await getHealth()
        if (!health.stockfish_available) { setEngineStatus('unavailable'); return }
        setEngineStatus('available')
        await analyzePosition(true)
      } catch (error) {
        setEngineStatus('unknown')
        setAnalysisError(error instanceof Error ? error.message : 'Unable to reach the API')
      }
    } else {
      await analyzePosition(true)
    }
  }

  const applyBestMove = () => {
    if (!analysis?.best_move || analysis.fen !== fen || game.isGameOver()) return
    const uci = analysis.best_move
    if (uci.length < 4) return
    commitMove(uci.slice(0, 2) as Square, uci.slice(2, 4) as Square, uci[4] as PieceSymbol | undefined)
  }

  return <div className="page-wrap live-page">
    <header className="page-header"><div><div className="eyebrow">ENGINE ANALYSIS</div><h1>Live Chess &amp; Analysis</h1><p>Play through a legal position and request a real Stockfish evaluation.</p></div><span className={`phase-badge engine-badge engine-badge--${engineStatus}`}><span className="phase-dot" />{engineStatus === 'checking' ? 'CHECKING ENGINE' : engineStatus === 'available' ? 'ENGINE AVAILABLE' : engineStatus === 'unavailable' ? 'ENGINE UNAVAILABLE' : 'ENGINE STATUS UNKNOWN'}</span></header>

    {engineStatus === 'unavailable' && <div className="engine-notice" role="status">Stockfish is unavailable. You can still play moves and inspect the position locally.<button type="button" onClick={() => void refreshEngine()}>Check again</button></div>}
    {engineStatus === 'unknown' && <div className="engine-notice engine-notice--muted" role="status">The API health check could not confirm Stockfish status. Analysis requests will verify availability.<button type="button" onClick={() => void refreshEngine()}>Check again</button></div>}

    <div className="live-layout">
      <section className="board-panel panel" aria-label="Chessboard">
        <div className="board-topline"><div><span className="turn-indicator" data-turn={game.turn()} />{game.isGameOver() ? 'Game over' : `${game.turn() === 'w' ? 'White' : 'Black'} to move`}</div><button type="button" className="secondary-action" onClick={resetBoard}>Reset board</button></div>
        <div className="chessboard" role="grid" aria-label="Chess board position">
          {game.board().map((rank, row) => <div className="board-rank" role="row" key={row}>{rank.map((piece, column) => {
            const square = `${files[column]}${8 - row}` as Square
            const isSelected = selected === square
            const isLegal = legalDestinations.has(square)
            const isBestMove = analysis?.fen === fen && (analysis.best_move?.slice(0, 2) === square || analysis.best_move?.slice(2, 4) === square)
            const description = piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${pieceName(piece.type)} on ${square}` : `Empty ${square}`
            return <button type="button" role="gridcell" aria-label={description} aria-selected={isSelected} key={square} className={`board-square ${(row + column) % 2 === 0 ? 'board-square--light' : 'board-square--dark'}${isSelected ? ' is-selected' : ''}${isLegal ? ' is-legal-target' : ''}${isBestMove ? ' is-best-move' : ''}`} onClick={() => clickSquare(square)} disabled={game.isGameOver()}>
              {piece && <span className={`chess-piece chess-piece--${piece.color}`} aria-hidden="true">{symbols[`${piece.color}${piece.type}`]}</span>}
              {isLegal && !piece && <span className="legal-dot" aria-hidden="true" />}
              {isLegal && piece && <span className="legal-ring" aria-hidden="true" />}
              {column === 0 && <span className="board-coordinate board-coordinate--rank" aria-hidden="true">{8 - row}</span>}
              {row === 7 && <span className="board-coordinate board-coordinate--file" aria-hidden="true">{files[column]}</span>}
            </button>
          })}</div>)}
        </div>
        <div className={`position-state${game.isCheck() ? ' position-state--check' : ''}`} role="status">{status}</div>
        {moveMessage && <div className="move-feedback" role="status">{moveMessage}</div>}
        {pendingPromotion && <div className="promotion-picker" role="group" aria-label="Choose promotion piece"><span>Promote pawn to</span>{(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(piece => <button type="button" key={piece} onClick={() => commitMove(pendingPromotion.from, pendingPromotion.to, piece)} aria-label={`Promote to ${pieceName(piece)}`}>{symbols[`${game.turn()}${piece}`]}</button>)}</div>}
        <label className="fen-label" htmlFor="position-fen">Current FEN</label><textarea id="position-fen" className="fen-display" readOnly value={fen} rows={2} />
      </section>

      <aside className="analysis-column">
        <section className="panel analysis-panel">
          <div className="analysis-panel-head"><div><div className="eyebrow">STOCKFISH</div><h2>Position analysis</h2></div><span className={`engine-mini engine-mini--${engineStatus}`} aria-label={`Engine ${engineStatus}`} /></div>
          <p className="analysis-intro">Analysis runs on the current board position using the backend’s Stockfish service.</p>
          <button type="button" className="primary-action" onClick={() => void analyzePosition()} disabled={game.isGameOver() || analysisLoading || engineStatus === 'unavailable'}>{analysisLoading ? 'Analyzing position…' : game.isGameOver() ? 'Position is terminal' : engineStatus === 'unavailable' ? 'Engine unavailable' : 'Analyze position'}</button>
          {game.isGameOver() && <p className="analysis-help">The board rules detect this terminal position locally; no engine result is fabricated.</p>}
          {analysisError && <div className="analysis-error" role="alert">{analysisError}<button type="button" onClick={() => void retryAnalysis()} disabled={analysisLoading || engineStatus === 'checking'}>Retry</button></div>}
          {analysisLoading && <div className="analysis-loading" role="status"><span className="loading-pulse" />Waiting for backend analysis…</div>}
          {analysis && analysis.fen === fen && <AnalysisResult result={analysis} onApplyBestMove={applyBestMove} />}
          {!analysis && !analysisError && !analysisLoading && !game.isGameOver() && <div className="analysis-empty">Analyze the current position to request a real engine evaluation and best move.</div>}
        </section>
        <section className="panel capability-panel"><h2>Available controls</h2><ul><li>Legal local moves, including castling, en passant, and promotion.</li><li>Position validation and engine evaluation through the backend.</li><li>Reset to the standard starting position at any time.</li></ul><p>Moves are kept in this browser; the API accepts a FEN for analysis and does not persist a game.</p></section>
      </aside>
    </div>
  </div>
}

function AnalysisResult({ result, onApplyBestMove }: { result: ChessRecommendationResponse; onApplyBestMove: () => void }) {
  return <div className="analysis-result" aria-label="Engine analysis result">
    {result.evaluation_type === 'cp' && <div className="evaluation-card"><span>Evaluation · White perspective</span><strong>{result.evaluation === null ? 'Unavailable' : `${result.evaluation > 0 ? '+' : ''}${result.evaluation.toFixed(2)} pawns`}</strong><small>Centipawn score converted to pawn units by the backend</small></div>}
    {result.evaluation_type === 'mate' && <div className="evaluation-card evaluation-card--mate"><span>Mate distance · White perspective</span><strong>{result.evaluation_mate === null ? 'Unavailable' : result.evaluation_mate === 0 ? 'Mate now' : `${result.evaluation_mate > 0 ? 'White' : 'Black'} mates in ${Math.abs(result.evaluation_mate)}`}</strong><small>Mate score, not a centipawn evaluation</small></div>}
    {result.evaluation_type === 'terminal' && <div className="terminal-card"><strong>Terminal position</strong><span>{result.terminal_reason ? formatTerminal(result.terminal_reason) : 'No legal continuation'}</span></div>}
    {result.best_move_san && <div className="best-move-row"><div><span>Suggested move</span><strong>{result.best_move_san}</strong></div><button type="button" className="secondary-action" onClick={onApplyBestMove}>Play move</button></div>}
    <div className="engine-metadata"><span>Depth<strong>{result.depth ?? 'Unavailable'}</strong></span><span>Analysis time<strong>{result.analysis_time_ms.toFixed(1)} ms</strong></span></div>
    {result.principal_variation.length > 0 && <div className="pv-line"><span>Principal variation · SAN</span><p>{result.principal_variation.map((move, index) => <span key={`${index}-${move}`}>{move}</span>)}</p></div>}
  </div>
}

function describePosition(game: Chess) {
  if (game.isCheckmate()) return `Checkmate - ${game.turn() === 'w' ? 'Black' : 'White'} wins.`
  if (game.isStalemate()) return 'Stalemate - drawn position.'
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition.'
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material.'
  if (game.isDrawByFiftyMoves()) return 'Draw by the fifty-move rule.'
  if (game.isDraw()) return 'Drawn position.'
  if (game.isCheck()) return `${game.turn() === 'w' ? 'White' : 'Black'} to move - check.`
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move.`
}
function pieceName(piece: PieceSymbol) { return ({ k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' })[piece] }
function formatTerminal(reason: string) { return reason.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase()) }
