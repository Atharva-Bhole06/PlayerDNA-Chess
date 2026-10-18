import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { ApiError, getChessRecommendation, getHealth, cancelQueue, getMultiplayerGame, getQueueStatus, joinQueue } from '../api/client'
import type { ChessRecommendationResponse, QueueStatus } from '../api/types'
import { MultiplayerGame } from './MultiplayerGame'
import { AuthContext } from '../context/AuthContext'
import { GameOverModal } from '../components/GameOverModal'
import { IconAI, IconLightbulb, IconUser } from '../components/Icons'

const files = 'abcdefgh'
const symbols: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
}
const initialChess = () => new Chess()

export function LiveChessPage() {
  let routeId: string | undefined
  let searchGame: string | null = null
  let modeParam: string | null = null

  try {
    const params = useParams()
    routeId = params.id
  } catch {
    routeId = undefined
  }

  try {
    const [searchParams] = useSearchParams()
    searchGame = searchParams.get('game')
    modeParam = searchParams.get('mode')
  } catch {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      searchGame = sp.get('game')
      modeParam = sp.get('mode')
    }
  }

  const multiplayerId = routeId || searchGame

  if (multiplayerId) {
    return <MultiplayerGame gameId={multiplayerId} />
  }

  if (modeParam === 'unrated') {
    return <NormalPlayLobby />
  }

  const mode = modeParam && ['ai', 'coach'].includes(modeParam) ? (modeParam as 'ai' | 'coach') : 'analysis'
  return <LocalChessAnalysis mode={mode} />
}

export function NormalPlayLobby() {
  const navigate = useNavigate()
  const auth = useContext(AuthContext)
  const user = auth?.user ?? null

  const [casualState, setCasualState] = useState<'idle' | 'waiting' | 'matched' | 'error'>('idle')
  const [casualWait, setCasualWait] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [matchedGame, setMatchedGame] = useState<{
    gameId: string
    whiteUsername: string
    blackUsername: string
  } | null>(null)
  const casualTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (casualTimer.current) clearInterval(casualTimer.current)
    }
  }, [])

  const handleMatchedGame = async (gameId: string) => {
    if (casualTimer.current) clearInterval(casualTimer.current)
    casualTimer.current = null
    setCasualState('matched')
    try {
      const gameData = await getMultiplayerGame(gameId)
      setMatchedGame({
        gameId,
        whiteUsername: gameData.white_username,
        blackUsername: gameData.black_username,
      })
    } catch {
      setMatchedGame({
        gameId,
        whiteUsername: user?.username || 'You',
        blackUsername: 'Opponent',
      })
    }
  }

  const startCasualQueue = async () => {
    if (!user) {
      navigate('/login?from=/live-chess?mode=unrated')
      return
    }
    setCasualState('waiting')
    setCasualWait(0)
    setErrorMessage(null)
    setMatchedGame(null)
    try {
      const initial: QueueStatus = await joinQueue('casual')
      if (initial.status === 'matched' && initial.game_id) {
        await handleMatchedGame(initial.game_id)
        return
      }
      casualTimer.current = setInterval(async () => {
        try {
          const s = await getQueueStatus()
          if (s.status === 'matched' && s.game_id) {
            await handleMatchedGame(s.game_id)
          } else {
            setCasualWait(s.wait_seconds)
          }
        } catch (err) {
          if (casualTimer.current) clearInterval(casualTimer.current)
          casualTimer.current = null
          setCasualState('error')
          setErrorMessage(err instanceof Error ? err.message : 'Unable to check queue status.')
        }
      }, 2000)
    } catch (err) {
      setCasualState('error')
      setErrorMessage(err instanceof Error ? err.message : 'Unable to connect to casual queue.')
    }
  }

  const stopCasualQueue = async () => {
    if (casualTimer.current) clearInterval(casualTimer.current)
    casualTimer.current = null
    try {
      await cancelQueue()
    } catch {
      // ignore
    }
    setCasualState('idle')
    setCasualWait(0)
  }

  return (
    <div className="page-wrap live-page normal-play-wrap">
      <header className="page-header">
        <div>
          <div className="eyebrow">CASUAL MATCHMAKING</div>
          <h1>Normal Play</h1>
          <p>Casual, unrated human-versus-human matchmaking. Play a live match without affecting your competitive rating.</p>
        </div>
        <span className="phase-badge engine-badge--available">
          <span className="phase-dot" />
          CASUAL · UNRATED
        </span>
      </header>

      <div className="normal-play-container">
        <div className="normal-play-card panel">
          <div className="normal-play-card-header">
            <div className="normal-play-icon-badge" aria-hidden="true">
              <IconUser size={32} />
            </div>
            <h2>Find a Human Opponent</h2>
            <p>Queue up for a 10-minute game against an available online player.</p>
          </div>

          <div className="normal-play-meta-grid">
            <div className="normal-play-meta-item">
              <span>Time Control</span>
              <strong>10 min Rapid</strong>
            </div>
            <div className="normal-play-meta-item">
              <span>Rating Policy</span>
              <strong className="text-lime">Unrated (Casual)</strong>
            </div>
            <div className="normal-play-meta-item">
              <span>Side Assignment</span>
              <strong>Random (White or Black)</strong>
            </div>
            <div className="normal-play-meta-item">
              <span>Active Player</span>
              <strong>{user ? user.username : 'Guest'}</strong>
            </div>
          </div>

          {errorMessage && (
            <div className="form-error" role="alert" style={{ marginTop: '12px', textAlign: 'center' }}>
              {errorMessage}
            </div>
          )}

          <div className="normal-play-actions">
            {user ? (
              <button
                type="button"
                className="primary-action btn-find-opponent"
                onClick={() => void startCasualQueue()}
                disabled={casualState === 'waiting' || casualState === 'matched'}
              >
                Find Human Opponent
              </button>
            ) : (
              <div className="normal-play-auth-prompt">
                <p>Sign in to queue for human multiplayer games.</p>
                <Link to="/login?from=/live-chess?mode=unrated" className="primary-action">
                  Sign In to Play
                </Link>
              </div>
            )}
            <Link to="/play" className="secondary-action">
              Back to Play Arena
            </Link>
          </div>
        </div>
      </div>

      {/* Searching For Opponent Modal / Overlay */}
      {casualState === 'waiting' && (
        <div className="arena-modal-backdrop" role="dialog" aria-modal="true" aria-label="Searching for Opponent">
          <div className="arena-modal-card panel">
            <div className="modal-icon-badge" aria-hidden="true">
              <span className="loading-pulse" />
            </div>
            <h3>Searching for Opponent…</h3>
            <p>
              Waiting for an available human player in the casual queue.
            </p>
            <div className="searching-timer-badge">
              <span>Elapsed:</span> <strong>{casualWait}s</strong>
            </div>
            <div className="modal-btn-group">
              <button
                type="button"
                className="secondary-action"
                onClick={() => void stopCasualQueue()}
              >
                Cancel Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Found Modal */}
      {casualState === 'matched' && (
        <div className="arena-modal-backdrop" role="dialog" aria-modal="true" aria-label="Match Found">
          <div className="arena-modal-card panel match-found-card">
            <span className="eyebrow" style={{ textAlign: 'center', display: 'block' }}>CASUAL MATCH FOUND</span>
            <h3 className="text-lime" style={{ textAlign: 'center', margin: '4px 0 16px', fontSize: '22px' }}>Opponent Paired!</h3>

            <div className="match-versus-container">
              <div className="match-player-card match-player-card--white">
                <span className="match-player-pawn">♔</span>
                <div className="match-player-details">
                  <strong>{matchedGame?.whiteUsername || 'White Player'}</strong>
                  <small>Playing as White</small>
                </div>
              </div>

              <div className="match-vs-badge" aria-hidden="true">VS</div>

              <div className="match-player-card match-player-card--black">
                <span className="match-player-pawn">♚</span>
                <div className="match-player-details">
                  <strong>{matchedGame?.blackUsername || 'Black Player'}</strong>
                  <small>Playing as Black</small>
                </div>
              </div>
            </div>

            <div className="match-found-notice">
              <span>Time Control: 10 min Rapid</span>
              <span>·</span>
              <span className="text-lime">Unrated (Casual)</span>
            </div>

            <div className="modal-btn-group" style={{ marginTop: '18px', justifyContent: 'center' }}>
              <button
                type="button"
                className="primary-action btn-enter-game"
                onClick={() => {
                  if (matchedGame?.gameId) {
                    navigate(`/live-chess?game=${encodeURIComponent(matchedGame.gameId)}`)
                  }
                }}
              >
                Enter Game →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function LocalChessAnalysis({ mode = 'analysis' }: { mode?: 'analysis' | 'unrated' | 'ai' | 'coach' }) {
  const auth = useContext(AuthContext)
  const user = auth?.user ?? null

  const [game, setGame] = useState(initialChess)
  const [selected, setSelected] = useState<Square | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)
  const [moveMessage, setMoveMessage] = useState('')
  const [analysis, setAnalysis] = useState<ChessRecommendationResponse | null>(null)
  const [analysisLoading, setAnalysisLoading] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [engineStatus, setEngineStatus] = useState<'checking' | 'available' | 'unavailable' | 'unknown'>('checking')

  // AI Opponent states
  const [aiThinking, setAiThinking] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // AI Hint state
  const [hint, setHint] = useState<{ move: string; san: string; explanation: string } | null>(null)
  const [hintLoading, setHintLoading] = useState(false)

  // Game over state
  const [resigned, setResigned] = useState(false)
  const [showGameOverModal, setShowGameOverModal] = useState(false)
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white')

  const gameRef = useRef(game)
  const analysisController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    getHealth(controller.signal).then(health => {
      if (!controller.signal.aborted) setEngineStatus(health.stockfish_available ? 'available' : 'unavailable')
    }).catch(() => { if (!controller.signal.aborted) setEngineStatus('unknown') })
    return () => {
      controller.abort()
      analysisController.current?.abort()
    }
  }, [])

  const fen = game.fen()
  const legalDestinations = useMemo(() => selected ? new Set(game.moves({ square: selected, verbose: true }).map(move => move.to)) : new Set<Square>(), [game, selected])
  const status = describePosition(game)

  // Automatically trigger game over modal on terminal position
  const isTerminal = game.isGameOver() || resigned
  useEffect(() => {
    if (isTerminal) {
      setShowGameOverModal(true)
    }
  }, [isTerminal])

  const cancelAnalysis = () => {
    analysisController.current?.abort()
    analysisController.current = null
    setAnalysisLoading(false)
  }

  const makeAiMove = async (targetFen: string) => {
    if (engineStatus === 'unavailable') {
      setAiError('Stockfish engine is unavailable. You can continue playing locally.')
      return
    }
    setAiThinking(true)
    setAiError(null)
    try {
      const rec = await getChessRecommendation(targetFen)
      if (rec.best_move && gameRef.current.fen() === targetFen) {
        const uci = rec.best_move
        const from = uci.slice(0, 2) as Square
        const to = uci.slice(2, 4) as Square
        const promo = uci[4] as PieceSymbol | undefined
        commitMove(from, to, promo, true)
      }
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Stockfish was unable to respond.')
    } finally {
      setAiThinking(false)
    }
  }

  const commitMove = (from: Square, to: Square, promotion?: PieceSymbol, isAi = false) => {
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
      setHint(null) // Invalidate hint on move

      // Trigger AI opponent response when playing AI or Coach mode
      const aiColor = boardOrientation === 'white' ? 'b' : 'w'
      if ((mode === 'ai' || mode === 'coach') && !isAi && next.turn() === aiColor && !next.isGameOver()) {
        void makeAiMove(next.fen())
      } else if (mode === 'coach' && !next.isGameOver()) {
        void analyzePosition(false, next.fen())
      }
    } catch {
      setMoveMessage('That move is not legal in this position.')
      setPendingPromotion(null)
    }
  }

  const clickSquare = (square: Square) => {
    if (isTerminal || pendingPromotion || ((mode === 'ai' || mode === 'coach') && aiThinking)) return
    const aiColor = boardOrientation === 'white' ? 'b' : 'w'
    if ((mode === 'ai' || mode === 'coach') && game.turn() === aiColor) return

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
    setAiThinking(false)
    setAiError(null)
    setHint(null)
    setResigned(false)
    setShowGameOverModal(false)
  }

  const analyzePosition = async (retryUnavailable = false, targetFen?: string) => {
    const fenToAnalyze = targetFen || game.fen()
    if (game.isGameOver() || analysisLoading || (engineStatus === 'unavailable' && !retryUnavailable)) return
    cancelAnalysis()
    const controller = new AbortController()
    analysisController.current = controller
    setAnalysis(null)
    setAnalysisError(null)
    setAnalysisLoading(true)
    try {
      const response = await getChessRecommendation(fenToAnalyze, controller.signal)
      if (!controller.signal.aborted && gameRef.current.fen() === fenToAnalyze) {
        setAnalysis(response)
        if (response.evaluation_type === 'terminal') setEngineStatus('available')
      }
    } catch (error) {
      if (!controller.signal.aborted && gameRef.current.fen() === fenToAnalyze) {
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

  const requestHint = async () => {
    if (isTerminal || hintLoading || engineStatus === 'unavailable') return
    setHintLoading(true)
    try {
      const rec = await getChessRecommendation(game.fen())
      if (rec.best_move_san) {
        setHint({
          move: rec.best_move ?? '',
          san: rec.best_move_san,
          explanation: explainMoveTactics(rec.best_move_san, game.fen())
        })
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Hint unavailable')
    } finally {
      setHintLoading(false)
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

  const handleResign = () => {
    if (isTerminal) return
    setResigned(true)
    setShowGameOverModal(true)
  }


  // Determine game-over outcomes from user perspective
  const userColor = boardOrientation === 'white' ? 'w' : 'b'
  let userWon: boolean | null = null
  let winner = 'Draw'
  let score = '1/2-1/2'
  let termination = 'Drawn'

  if (resigned) {
    userWon = false
    winner = userColor === 'w' ? 'Black' : 'White'
    score = userColor === 'w' ? '0-1' : '1-0'
    termination = 'Resignation'
  } else if (game.isCheckmate()) {
    if (game.turn() !== userColor) {
      userWon = true
      winner = userColor === 'w' ? 'White' : 'Black'
      score = userColor === 'w' ? '1-0' : '0-1'
      termination = 'Checkmate'
    } else {
      userWon = false
      winner = userColor === 'w' ? 'Black' : 'White'
      score = userColor === 'w' ? '0-1' : '1-0'
      termination = 'Checkmate'
    }
  } else if (game.isStalemate()) {
    userWon = null
    winner = 'Draw'
    score = '1/2-1/2'
    termination = 'Stalemate'
  } else if (game.isThreefoldRepetition()) {
    userWon = null
    winner = 'Draw'
    score = '1/2-1/2'
    termination = 'Threefold Repetition'
  } else if (game.isInsufficientMaterial()) {
    userWon = null
    winner = 'Draw'
    score = '1/2-1/2'
    termination = 'Insufficient Material'
  } else if (game.isDrawByFiftyMoves()) {
    userWon = null
    winner = 'Draw'
    score = '1/2-1/2'
    termination = 'Fifty-Move Rule'
  } else if (game.isDraw()) {
    userWon = null
    winner = 'Draw'
    score = '1/2-1/2'
    termination = 'Draw'
  }

  const isWhite = boardOrientation === 'white'
  const rowIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const colIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const boardMatrix = game.board()
  const moveHistory = game.history({ verbose: true })

  const pageEyebrow = mode === 'ai' ? 'STOCKFISH ENGINE' : mode === 'coach' ? 'INTERACTIVE COACHING' : 'ENGINE ANALYSIS'
  const pageTitle = mode === 'ai' ? 'Play Stockfish AI' : mode === 'coach' ? 'Play with Coach' : 'Live Chess & Analysis'
  const pageSubtitle = mode === 'ai'
    ? 'Play against the integrated Stockfish UCI engine. Moves are calculated in real time.'
    : mode === 'coach'
      ? 'Play through a game with real-time move evaluations and tactical suggestions from Stockfish.'
      : 'Play through a legal position and request a real Stockfish evaluation.'

  return (
    <div className="page-wrap live-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">{pageEyebrow}</div>
          <h1>{pageTitle}</h1>
          <p>{pageSubtitle}</p>
        </div>
        <span className={`phase-badge engine-badge engine-badge--${engineStatus}`}>
          <span className="phase-dot" />
          {engineStatus === 'checking' ? 'CHECKING ENGINE' : engineStatus === 'available' ? 'ENGINE AVAILABLE' : engineStatus === 'unavailable' ? 'ENGINE UNAVAILABLE' : 'ENGINE STATUS UNKNOWN'}
        </span>
      </header>

      {engineStatus === 'unavailable' && (
        <div className="engine-notice" role="status">
          Stockfish is unavailable. You can still play moves and inspect the position locally.
          <button type="button" onClick={() => void refreshEngine()}>Check again</button>
        </div>
      )}
      {engineStatus === 'unknown' && (
        <div className="engine-notice engine-notice--muted" role="status">
          The API health check could not confirm Stockfish status. Analysis requests will verify availability.
          <button type="button" onClick={() => void refreshEngine()}>Check again</button>
        </div>
      )}
      {aiError && <div className="engine-notice engine-notice--error" role="alert">{aiError}</div>}

      {/* Shared 2-Column Play Layout */}
      <div className="live-layout play-centered-layout">
        {/* Main Column: Opponent Strip, Board, Player Strip */}
        <section className="board-panel panel" aria-label="Chessboard">
          {/* Opponent Player Strip (Above the board) */}
          <div className="player-strip player-strip--opponent" aria-label="Opponent Identity">
            <div className="player-strip-left">
              <div className="player-avatar-badge player-avatar-badge--cyan" aria-hidden="true">
                {mode === 'coach' ? '🎓' : mode === 'ai' ? '🤖' : '⚙️'}
              </div>
              <div className="player-strip-info">
                <div className="player-strip-name-row">
                  <span className="player-strip-name">
                    {mode === 'coach' ? 'Stockfish Coach' : mode === 'ai' ? 'Stockfish 16 Engine' : 'Stockfish Analysis'}
                  </span>
                  <span className="player-strip-rating">
                    {mode === 'coach' ? 'Interactive Guide' : mode === 'ai' ? 'Depth 18 Engine' : 'Local Engine'}
                  </span>
                </div>
                <div className="player-strip-sub">
                  <span>{isWhite ? 'Black Pieces' : 'White Pieces'}</span>
                  <span>·</span>
                  <span className={aiThinking ? 'text-lime' : engineStatus === 'available' ? 'text-lime' : 'text-danger'}>
                    {aiThinking ? 'Calculating move…' : engineStatus === 'available' ? 'Engine Ready' : 'Engine Unavailable'}
                  </span>
                </div>
              </div>
            </div>
            <div className={`player-strip-clock${game.turn() !== userColor && !isTerminal ? ' player-strip-clock--active' : ''}`}>
              {mode === 'coach' ? 'Coach' : '10:00'}
            </div>
          </div>

          <div className="chessboard" role="grid" aria-label="Chess board position">
            {rowIndices.map((row, rIdx) => (
              <div className="board-rank" role="row" key={row}>
                {colIndices.map((column, cIdx) => {
                  const piece = boardMatrix[row][column]
                  const square = `${files[column]}${8 - row}` as Square
                  const isSelected = selected === square
                  const isLegal = legalDestinations.has(square)
                  const isBestMove = analysis?.fen === fen && (analysis.best_move?.slice(0, 2) === square || analysis.best_move?.slice(2, 4) === square)
                  const isHintTarget = hint?.move && (hint.move.slice(0, 2) === square || hint.move.slice(2, 4) === square)
                  const description = piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${pieceName(piece.type)} on ${square}` : `Empty ${square}`
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      aria-label={description}
                      aria-selected={isSelected}
                      key={square}
                      className={`board-square ${(row + column) % 2 === 0 ? 'board-square--light' : 'board-square--dark'}${isSelected ? ' is-selected' : ''}${isLegal ? ' is-legal-target' : ''}${isBestMove || isHintTarget ? ' is-best-move' : ''}`}
                      onClick={() => clickSquare(square)}
                      disabled={isTerminal || ((mode === 'ai' || mode === 'coach') && aiThinking)}
                    >
                      {piece && <span className={`chess-piece chess-piece--${piece.color}`} aria-hidden="true">{symbols[`${piece.color}${piece.type}`]}</span>}
                      {isLegal && !piece && <span className="legal-dot" aria-hidden="true" />}
                      {isLegal && piece && <span className="legal-ring" aria-hidden="true" />}
                      {cIdx === 0 && <span className="board-coordinate board-coordinate--rank" aria-hidden="true">{8 - row}</span>}
                      {rIdx === 7 && <span className="board-coordinate board-coordinate--file" aria-hidden="true">{files[column]}</span>}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Current Player Strip (Below the board) */}
          <div className="player-strip player-strip--me" aria-label="Current Player Identity">
            <div className="player-strip-left">
              <div className="player-avatar-badge player-avatar-badge--lime" aria-hidden="true">
                {isWhite ? '♔' : '♚'}
              </div>
              <div className="player-strip-info">
                <div className="player-strip-name-row">
                  <span className="player-strip-name">{user ? user.username : 'Guest Player'} (You)</span>
                  <span className="player-strip-rating">
                    {user ? `${user.rating} (Casual)` : '1200 (Casual)'}
                  </span>
                </div>
                <div className="player-strip-sub">
                  <span>{isWhite ? 'White Pieces' : 'Black Pieces'}</span>
                  <span>·</span>
                  <span className={game.turn() === userColor ? 'text-lime' : 'text-muted'}>
                    {isTerminal ? 'Game Concluded' : game.turn() === userColor ? 'Your Turn' : "Stockfish's Turn"}
                  </span>
                </div>
              </div>
            </div>
            <div className={`player-strip-clock${game.turn() === userColor && !isTerminal ? ' player-strip-clock--active' : ''}`}>
              10:00
            </div>
          </div>

          <div className={`position-state${game.isCheck() ? ' position-state--check' : ''}`} role="status">{status}</div>
          {moveMessage && <div className="move-feedback" role="status">{moveMessage}</div>}
          {pendingPromotion && (
            <div className="promotion-picker" role="group" aria-label="Choose promotion piece">
              <span>Promote pawn to</span>
              {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map(piece => (
                <button
                  type="button"
                  key={piece}
                  onClick={() => commitMove(pendingPromotion.from, pendingPromotion.to, piece)}
                  aria-label={`Promote to ${pieceName(piece)}`}
                >
                  {symbols[`${game.turn()}${piece}`]}
                </button>
              ))}
            </div>
          )}

          {/* Debug FEN container - preserved in DOM for test and engine integration, hidden from ordinary player UI */}
          <div className="visually-hidden">
            <label className="fen-label" htmlFor="position-fen">Current FEN</label>
            <textarea id="position-fen" className="fen-display" readOnly value={fen} rows={2} />
          </div>
        </section>

        {/* Side Column: Controls, Coach Guidance / Opponent Status, and Move History */}
        <aside className="analysis-column play-right-column">
          {/* COACH MODE PANEL */}
          {mode === 'coach' && (
            <section className="panel coach-dedicated-panel" aria-label="Coach Feedback">
              <div className="analysis-panel-head">
                <div>
                  <div className="eyebrow">COACH GUIDANCE</div>
                  <h2>Live Suggestions</h2>
                </div>
                <span className="coach-badge-live">COACH ACTIVE</span>
              </div>
              <p className="analysis-intro">
                Stockfish analyzes each position and provides tactical guidance move by move.
              </p>

              {/* Game Actions for Coach */}
              <div className="player-game-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
                <button
                  type="button"
                  className="secondary-action btn-player-resign"
                  onClick={handleResign}
                  disabled={isTerminal}
                >
                  Resign Game
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={resetBoard}
                >
                  Reset board
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                >
                  Flip Board
                </button>
              </div>

              {analysisLoading && (
                <div className="analysis-loading" role="status">
                  <span className="loading-pulse" />
                  Coach is analyzing…
                </div>
              )}

              {/* SECTION 1: SUGGESTED MOVE */}
              <div className="coach-section-card coach-suggested-move-card">
                <span className="coach-card-label">Suggested Move</span>
                <div className="coach-move-display">
                  <strong className="coach-move-notation">
                    {analysis?.best_move_san ?? (analysisLoading ? 'Analyzing…' : 'Make a move to see suggestions')}
                  </strong>
                  {analysis?.best_move_san && (
                    <button type="button" className="secondary-action btn-apply-coach-move" onClick={applyBestMove}>
                      Play suggested move
                    </button>
                  )}
                </div>
              </div>

              {/* SECTION 2: WHY THIS MOVE? */}
              <div className="coach-section-card coach-why-card">
                <span className="coach-card-label">Why This Move?</span>
                <p className="coach-why-text">
                  {analysis?.best_move_san
                    ? explainMoveTactics(analysis.best_move_san, fen)
                    : 'The coach explains the strategic and tactical purpose of the best continuation.'}
                </p>
              </div>

              {/* SECTION 3: POSITION EVALUATION */}
              <div className="coach-section-card coach-evaluation-card">
                <span className="coach-card-label">Position Evaluation</span>
                <div className="coach-eval-row">
                  <strong className="coach-eval-value text-lime">
                    {analysis?.evaluation_type === 'mate'
                      ? `Mate in ${analysis.evaluation_mate}`
                      : `${analysis?.evaluation && analysis.evaluation > 0 ? '+' : ''}${analysis?.evaluation?.toFixed(2) ?? '0.00'} pawns`}
                  </strong>
                  <span className="coach-eval-description">
                    {describeEvaluationPerspective(analysis)}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* PLAY AI OPPONENT PANEL */}
          {mode === 'ai' && (
            <section className="panel opponent-panel" aria-label="AI Opponent Information">
              <div className="analysis-panel-head">
                <div>
                  <div className="eyebrow">OPPONENT</div>
                  <h2>Stockfish AI</h2>
                </div>
                <span className="engine-mini engine-mini--available" aria-label="Engine active" />
              </div>

              <div className="ai-opponent-details">
                <div className="ai-badge-row">
                  <IconAI size={24} className="ai-icon" />
                  <div>
                    <strong>Stockfish 16 Engine</strong>
                    <small>Standard Rapid · Depth 18</small>
                  </div>
                </div>

                <div className="ai-status-indicator">
                  <span>Status:</span>
                  <strong className={aiThinking ? 'text-lime' : 'text-muted'}>
                    {aiThinking ? 'Stockfish is calculating…' : isTerminal ? 'Game Concluded' : 'Waiting for your move'}
                  </strong>
                </div>
              </div>

              {/* Game Actions for AI */}
              <div className="player-game-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px' }}>
                <button
                  type="button"
                  className="secondary-action btn-hint"
                  onClick={() => void requestHint()}
                  disabled={isTerminal || aiThinking || hintLoading}
                >
                  <IconLightbulb size={14} />
                  <span>{hintLoading ? 'Thinking…' : 'Hint'}</span>
                </button>
                <button
                  type="button"
                  className="secondary-action btn-player-resign"
                  onClick={handleResign}
                  disabled={isTerminal}
                >
                  Resign Game
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={resetBoard}
                >
                  Reset board
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                >
                  Flip Board
                </button>
              </div>

              {/* Active In-Game Hint Card */}
              {hint && (
                <div className="hint-card panel" aria-label="Move Hint">
                  <div className="hint-header">
                    <IconLightbulb size={16} />
                    <strong>Suggested: {hint.san}</strong>
                  </div>
                  <p className="hint-explanation">{hint.explanation}</p>
                  <small className="hint-disclaimer">Hint will not be played automatically.</small>
                </div>
              )}

              <div className="ai-rules-summary">
                <h4>Engine Sparring Rules</h4>
                <ul>
                  <li>Stockfish makes its own moves automatically.</li>
                  <li>Use the Hint button if you need tactical inspiration.</li>
                  <li>Unrated game — does not affect competitive Elo.</li>
                </ul>
              </div>
            </section>
          )}

          {/* LOCAL POSITION ANALYSIS PANEL */}
          {(mode === 'analysis' || mode === 'unrated') && (
            <section className="panel analysis-panel" aria-label="Position Analysis">
              <div className="analysis-panel-head">
                <div>
                  <div className="eyebrow">STOCKFISH</div>
                  <h2>Position analysis</h2>
                </div>
                <span className={`engine-mini engine-mini--${engineStatus}`} aria-label={`Engine ${engineStatus}`} />
              </div>
              <p className="analysis-intro">Analyze the current position locally using the Stockfish service.</p>

              <div className="player-game-actions" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={resetBoard}
                >
                  Reset board
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setBoardOrientation(prev => prev === 'white' ? 'black' : 'white')}
                >
                  Flip Board
                </button>
              </div>

              <button
                type="button"
                className="primary-action"
                onClick={() => void analyzePosition()}
                disabled={game.isGameOver() || analysisLoading || engineStatus === 'unavailable'}
              >
                {analysisLoading ? 'Analyzing position…' : game.isGameOver() ? 'Position is terminal' : engineStatus === 'unavailable' ? 'Engine unavailable' : 'Analyze position'}
              </button>
              {game.isGameOver() && <p className="analysis-help">The board rules detect this terminal position locally; no engine result is fabricated.</p>}
              {analysisError && <div className="analysis-error" role="alert">{analysisError}<button type="button" onClick={() => void retryAnalysis()} disabled={analysisLoading || engineStatus === 'checking'}>Retry</button></div>}
              {analysisLoading && <div className="analysis-loading" role="status"><span className="loading-pulse" />Waiting for backend analysis…</div>}
              {analysis && analysis.fen === fen && <AnalysisResult result={analysis} onApplyBestMove={applyBestMove} />}
              {!analysis && !analysisError && !analysisLoading && !game.isGameOver() && <div className="analysis-empty">Analyze the current position to request a real engine evaluation and best move.</div>}
            </section>
          )}

          {/* Scrollable Move History List */}
          {moveHistory.length > 0 && (
            <section className="panel" style={{ padding: '16px' }} aria-label="Move History">
              <span className="coach-card-label" style={{ display: 'block', marginBottom: '8px', fontSize: '11px' }}>Move History</span>
              <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '12px' }}>
                  {moveHistory.map((m, idx) => {
                    if (idx % 2 === 0) {
                      const moveNumber = Math.floor(idx / 2) + 1
                      const blackMove = moveHistory[idx + 1]
                      return (
                        <div key={idx} style={{ gridColumn: 'span 2', display: 'flex', gap: '8px', padding: '2px 0' }}>
                          <span style={{ color: 'var(--color-muted)', width: '28px' }}>{moveNumber}.</span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{m.san}</span>
                          <span style={{ flex: 1, fontWeight: 600 }}>{blackMove?.san ?? ''}</span>
                        </div>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            </section>
          )}
        </aside>
      </div>

      {/* Prominent Game-Over Modal */}
      <GameOverModal
        isOpen={showGameOverModal}
        userWon={userWon}
        winner={winner}
        score={score}
        termination={termination}
        onPlayAgain={resetBoard}
        onClose={() => setShowGameOverModal(false)}
        opponentUsername={mode === 'ai' ? 'Stockfish 16 Engine' : mode === 'coach' ? 'Stockfish Coach' : 'Local Sparring'}
        opponentRating={mode === 'ai' || mode === 'coach' ? 'Engine' : undefined}
        isCasual={true}
      />
    </div>
  )
}

function AnalysisResult({ result, onApplyBestMove }: { result: ChessRecommendationResponse; onApplyBestMove: () => void }) {
  return (
    <div className="analysis-result" aria-label="Engine analysis result">
      {result.evaluation_type === 'cp' && (
        <div className="evaluation-card">
          <span>Evaluation · White perspective</span>
          <strong>{result.evaluation === null ? 'Unavailable' : `${result.evaluation > 0 ? '+' : ''}${result.evaluation.toFixed(2)} pawns`}</strong>
          <small>Centipawn score converted to pawn units by the backend</small>
        </div>
      )}
      {result.evaluation_type === 'mate' && (
        <div className="evaluation-card evaluation-card--mate">
          <span>Mate distance · White perspective</span>
          <strong>{result.evaluation_mate === null ? 'Unavailable' : result.evaluation_mate === 0 ? 'Mate now' : `${result.evaluation_mate > 0 ? 'White' : 'Black'} mates in ${Math.abs(result.evaluation_mate)}`}</strong>
          <small>Mate score, not a centipawn evaluation</small>
        </div>
      )}
      {result.evaluation_type === 'terminal' && (
        <div className="terminal-card">
          <strong>Terminal position</strong>
          <span>{result.terminal_reason ? formatTerminal(result.terminal_reason) : 'No legal continuation'}</span>
        </div>
      )}
      {result.best_move_san && (
        <div className="best-move-row">
          <div>
            <span>Suggested move</span>
            <strong>{result.best_move_san}</strong>
          </div>
          <button type="button" className="secondary-action" onClick={onApplyBestMove}>Play move</button>
        </div>
      )}
      <div className="engine-metadata">
        <span>Depth<strong>{result.depth ?? 'Unavailable'}</strong></span>
        <span>Analysis time<strong>{result.analysis_time_ms.toFixed(1)} ms</strong></span>
      </div>
      {result.principal_variation.length > 0 && (
        <div className="pv-line">
          <span>Principal variation · SAN</span>
          <p>{result.principal_variation.map((move, index) => <span key={`${index}-${move}`}>{move}</span>)}</p>
        </div>
      )}
    </div>
  )
}

function explainMoveTactics(san: string, fen: string): string {
  if (!san) return 'Considers the best tactical path for the current position.'
  if (san.includes('O-O-O')) return 'Queenside castling protects the king and activates the heavy rook.'
  if (san.includes('O-O')) return 'Kingside castling ensures king safety and activates the rook.'
  if (san.includes('#')) return 'Delivers checkmate, immediately ending the game in victory.'
  if (san.includes('+')) return 'Delivers check, forcing the opposing king or piece to respond to the threat.'
  if (san.includes('x')) return 'Executes a tactical capture to win material or eliminate a key defending piece.'
  if (san.startsWith('N') || san.startsWith('B')) {
    const isEarly = fen.split(' ')[5] ? parseInt(fen.split(' ')[5], 10) <= 12 : true
    return isEarly
      ? 'Develops a minor piece toward the center to prepare for tactics and king safety.'
      : 'Improves piece activity and exerts pressure on critical squares.'
  }
  if (san.startsWith('Q')) return 'Repurposes the queen to a stronger square with active diagonal and file control.'
  if (san.startsWith('R')) return 'Places the rook onto an open or semi-open file to control vertical lines.'
  if (san.startsWith('K')) return 'Repositions the king to a safer square.'
  return 'Advances a pawn to claim central space and free diagonals for piece development.'
}

function describeEvaluationPerspective(analysis: ChessRecommendationResponse | null): string {
  if (!analysis) return 'Evaluating position…'
  if (analysis.evaluation_type === 'mate') {
    const mateIn = analysis.evaluation_mate
    if (mateIn === null || mateIn === 0) return 'Immediate checkmate'
    return mateIn > 0 ? `White has a forced mate in ${mateIn}` : `Black has a forced mate in ${Math.abs(mateIn)}`
  }
  if (analysis.evaluation_type === 'terminal') {
    return 'Position is terminal'
  }
  const val = analysis.evaluation ?? 0
  if (val > 1.5) return 'White has a commanding advantage'
  if (val > 0.4) return 'White is slightly ahead'
  if (val < -1.5) return 'Black has a commanding advantage'
  if (val < -0.4) return 'Black is slightly ahead'
  return 'The position is roughly balanced'
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
