import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Chess, type Square } from 'chess.js'
import { ApiError, getMultiplayerGame, getPerformanceReport, openGameSocket } from '../api/client'
import type { MultiplayerGameState, PerformanceReport } from '../api/types'
import { GameOverModal } from '../components/GameOverModal'

const files = 'abcdefgh'
const symbols: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
}

export function MultiplayerGame({ gameId }: { gameId: string }) {
  const [serverState, setServerState] = useState<MultiplayerGameState | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting')
  const [opponentConnected, setOpponentConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(Date.now())
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [replayPly, setReplayPly] = useState<number | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const gameRef = useRef(new Chess())
  const serverStateRef = useRef<MultiplayerGameState | null>(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    let restorationTimer: ReturnType<typeof setTimeout> | null = null

    serverStateRef.current = null
    restoredRef.current = false

    const applyGameState = (incoming: MultiplayerGameState) => {
      if (stopped || incoming.game_id !== gameId) return
      const current = serverStateRef.current
      if (current && current.game_id === gameId) {
        if (incoming.ply_count < current.ply_count && incoming.status !== 'completed') {
          return
        }
      }
      serverStateRef.current = incoming
      restoredRef.current = true
      gameRef.current = new Chess(incoming.fen)
      setServerState(incoming)
      setSelected(null)

      if (restorationTimer) {
        clearTimeout(restorationTimer)
        restorationTimer = null
      }
      setError(prev => (prev && prev.includes('restoration timed out') ? null : prev))
    }

    // Safety timeout to prevent indefinite restoration screen
    restorationTimer = setTimeout(() => {
      if (!stopped && !restoredRef.current) {
        setError(prev => prev || 'Game restoration timed out. The server took too long to respond. You can retry or return to Play.')
        setConnection('failed')
      }
    }, 8000)

    const cleanupSocket = (ws: WebSocket | null) => {
      if (!ws) return
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close()
        } catch {
          // ignore
        }
      } else if (ws.readyState === WebSocket.CONNECTING) {
        ws.onopen = () => {
          try {
            ws.close()
          } catch {
            // ignore
          }
        }
      }
    }

    const connect = () => {
      if (stopped) return
      setConnection(attempts === 0 ? 'connecting' : 'reconnecting')
      if (socketRef.current) {
        cleanupSocket(socketRef.current)
        socketRef.current = null
      }
      let socket: WebSocket
      try {
        socket = openGameSocket(gameId)
      } catch (e) {
        setConnection('failed')
        setError(e instanceof Error ? e.message : 'Unable to open game connection')
        return
      }
      socketRef.current = socket
      socket.onopen = () => {
        attempts = 0
        setConnection('connected')
        setError(prev => (prev && (prev.includes('permission') || prev.includes('does not exist') || prev.includes('Authentication') || prev.includes('restoration timed out'))) ? prev : null)
      }
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as {
            type?: string
            game?: MultiplayerGameState
            detail?: string
            opponent_connected?: boolean
          }
          if (message.type === 'error') {
            setError(message.detail ?? 'Game action could not be applied')
            return
          }
          if (message.game) {
            applyGameState(message.game)
          }
          if (typeof message.opponent_connected === 'boolean') {
            setOpponentConnected(message.opponent_connected)
          }
        } catch {
          setError('Received an invalid update from the game server')
        }
      }
      socket.onerror = () => setConnection('reconnecting')
      socket.onclose = event => {
        socketRef.current = null
        if (stopped) return
        if (event.code === 4401 || event.code === 4403 || event.code === 4404) {
          setConnection('failed')
          setError(event.reason || (event.code === 4401 ? 'Authentication required. Please sign in.' : event.code === 4403 ? 'You do not have permission to access this game.' : 'Game not found.'))
          return
        }
        attempts += 1
        if (attempts > 4) {
          setConnection('failed')
          setError('Connection lost. Unable to reach the game server after multiple attempts. Please retry or return to Play.')
          return
        }
        retry = setTimeout(connect, Math.min(4000, 500 * 2 ** Math.min(attempts, 3)))
      }
    }

    void getMultiplayerGame(gameId)
      .then(state => {
        if (!stopped) {
          applyGameState(state)
        }
      })
      .catch(e => {
        if (!stopped && !restoredRef.current) {
          if (restorationTimer) {
            clearTimeout(restorationTimer)
            restorationTimer = null
          }
          if (e instanceof ApiError && e.status === 401) {
            setError('Authentication required to view this game.')
            setConnection('failed')
          } else if (e instanceof ApiError && e.status === 403) {
            setError('You do not have permission to view this game.')
            setConnection('failed')
          } else if (e instanceof ApiError && e.status === 404) {
            setError('This game does not exist or has expired.')
            setConnection('failed')
          } else {
            setError(e instanceof Error ? e.message : 'Unable to load game')
          }
          cleanupSocket(socketRef.current)
          socketRef.current = null
        }
      })

    connect()
    const ticker = setInterval(() => setTick(Date.now()), 1000)
    return () => {
      stopped = true
      clearInterval(ticker)
      if (retry) clearTimeout(retry)
      if (restorationTimer) clearTimeout(restorationTimer)
      cleanupSocket(socketRef.current)
      socketRef.current = null
    }
  }, [gameId])

  useEffect(() => {
    if (serverState?.status !== 'completed') return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const refresh = async () => {
      try {
        const value = await getPerformanceReport(gameId)
        if (stopped) return
        setReport(value)
        if (value.analysis_status === 'queued' || value.analysis_status === 'processing') {
          timer = setTimeout(() => void refresh(), 3000)
        }
      } catch (e) {
        if (!stopped) {
          if (e instanceof ApiError && e.status === 403) {
            setError('You do not have permission to view the performance report for this game.')
          } else {
            setError(e instanceof Error ? e.message : 'Unable to load game report')
          }
        }
      }
    }
    void refresh()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [gameId, serverState?.status])

  // Replay moves for completed games
  const replayMoves = useMemo(() => {
    if (!serverState?.pgn) return []
    try {
      const replayChess = new Chess()
      replayChess.loadPgn(serverState.pgn)
      return replayChess.history({ verbose: true })
    } catch {
      return []
    }
  }, [serverState?.pgn])

  const isCompleted = serverState?.status === 'completed'
  const activePly = isCompleted && replayMoves.length > 0
    ? (replayPly === null ? replayMoves.length : replayPly)
    : null

  const displayBoard = useMemo(() => {
    if (isCompleted && replayMoves.length > 0 && activePly !== null) {
      const b = new Chess()
      for (let i = 0; i < activePly; i++) {
        b.move(replayMoves[i])
      }
      return b
    }
    return new Chess(serverState?.fen)
  }, [isCompleted, replayMoves, activePly, serverState?.fen])

  const destinations = useMemo(() => {
    if (isCompleted) return new Set<Square>()
    return selected ? new Set(displayBoard.moves({ square: selected, verbose: true }).map(m => m.to)) : new Set<Square>()
  }, [displayBoard, selected, isCompleted])

  const color = serverState?.color === 'white' ? 'w' : 'b'
  const myTurn = !isCompleted && displayBoard.turn() === color

  const [modalDismissed, setModalDismissed] = useState(false)
  let userWon: boolean | null = null
  let winner = 'Draw'
  if (serverState?.result === '1/2-1/2') {
    userWon = null
    winner = 'Draw'
  } else if (serverState?.result === '1-0') {
    winner = serverState.white_username
    userWon = serverState.color === 'white'
  } else if (serverState?.result === '0-1') {
    winner = serverState.black_username
    userWon = serverState.color === 'black'
  }

  const send = (payload: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      setError('Reconnecting to the game server…')
      return
    }
    socketRef.current.send(JSON.stringify(payload))
    setError(null)
  }

  const clickSquare = (square: Square) => {
    if (!serverState || serverState.status !== 'active' || !myTurn) return
    const piece = displayBoard.get(square)
    if (selected && destinations.has(square)) {
      try {
        const move = displayBoard.move({
          from: selected,
          to: square,
          ...(piece?.type === 'p' && square[1] === (color === 'w' ? '8' : '1') ? { promotion: 'q' } : {})
        })
        send({
          type: 'move',
          uci: `${move.from}${move.to}${move.promotion ?? ''}`,
          expected_ply: serverState.ply_count
        })
      } catch {
        setError('That move is not legal.')
      }
      setSelected(null)
      return
    }
    if (piece?.color === color) {
      setSelected(square)
      setError(null)
    } else {
      setSelected(null)
    }
  }

  const whiteTime = displayedClock(serverState?.white_time_ms ?? 0, serverState, 'w', tick)
  const blackTime = displayedClock(serverState?.black_time_ms ?? 0, serverState, 'b', tick)

  if (!serverState) {
    return (
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <div className="eyebrow">MULTIPLAYER GAME</div>
            <h1>Live Chess</h1>
          </div>
        </header>
        <section className="state-panel" role={error ? 'alert' : 'status'}>
          {error ? (
            <div className="restoration-error-wrap">
              <p>{error}</p>
              <div style={{ marginTop: '16px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() => {
                    setError(null)
                    setConnection('connecting')
                    window.location.reload()
                  }}
                >
                  Retry Connection
                </button>
                <Link to="/play" className="secondary-action">
                  Return to Play Arena
                </Link>
                <Link to="/history" className="secondary-action">
                  Return to Game History
                </Link>
              </div>
            </div>
          ) : (
            <div className="restoration-loading-wrap">
              <span className="loading-pulse" />
              <p>Restoring the saved game…</p>
            </div>
          )}
        </section>
      </div>
    )
  }

  const isCasual = Boolean(serverState.pgn && serverState.pgn.includes('Casual Match'))
  const isWhite = serverState.color === 'white'

  const opponentUsername = isWhite ? serverState.black_username : serverState.white_username
  const opponentRating = isWhite ? serverState.black_rating : serverState.white_rating
  const opponentLabel = `${opponentUsername} · ${isCasual ? 'Casual (Unrated)' : `${opponentRating} Elo`}`
  const opponentTime = isWhite ? blackTime : whiteTime

  const myUsername = isWhite ? serverState.white_username : serverState.black_username
  const myRating = isWhite ? serverState.white_rating : serverState.black_rating
  const myLabel = `${myUsername} · ${isCasual ? 'Casual (Unrated)' : `${myRating} Elo`}`
  const myTime = isWhite ? whiteTime : blackTime

  const boardMatrix = displayBoard.board()
  const rowIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]
  const colIndices = isWhite ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0]

  return (
    <div className="page-wrap live-page multiplayer-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">
            {isCompleted ? 'PERSISTED GAME REVIEW' : isCasual ? 'NORMAL PLAY · CASUAL' : 'COMPETITIVE MATCH'}
          </div>
          <h1>{isCompleted ? 'Game Review & Replay' : isCasual ? 'Normal Play Match' : 'Live Chess'}</h1>
          <p>
            {isCompleted
              ? `Review the recorded moves and Stockfish post-game analysis. You played as ${serverState.color}.`
              : isCasual
                ? `Casual unrated game. Moves are verified by the game server. Your color is ${serverState.color}.`
                : `Competitive rated game. Moves are validated and stored by the game server. Your color is ${serverState.color}.`}
          </p>
        </div>
        <span className={`phase-badge ${isCompleted ? 'engine-badge--available' : connection === 'connected' ? '' : 'engine-badge--unavailable'}`}>
          <span className="phase-dot" />
          {isCompleted ? 'GAME COMPLETED' : connection.toUpperCase()}
        </span>
      </header>

      <div className="live-layout play-centered-layout">
        <section className="board-panel panel" aria-label="Multiplayer chessboard">
          {/* Opponent Player Strip (Above the board) */}
          <div className="player-strip player-strip--opponent" aria-label="Opponent Identity">
            <div className="player-strip-left">
              <div className="player-avatar-badge" aria-hidden="true">
                {isWhite ? '♚' : '♔'}
              </div>
              <div className="player-strip-info">
                <div className="player-strip-name-row">
                  <span className="player-strip-name">
                    <strong>{opponentLabel}</strong>
                  </span>
                </div>
                <div className="player-strip-sub">
                  <span>{isWhite ? 'Black Pieces' : 'White Pieces'}</span>
                  <span>·</span>
                  <span className={opponentConnected ? 'text-lime' : 'text-danger'}>
                    {opponentConnected ? 'Connected' : 'Reconnecting…'}
                  </span>
                </div>
              </div>
            </div>
            <div className={`player-strip-clock${!myTurn && !isCompleted ? ' player-strip-clock--active' : ''}`}>
              {opponentTime}
            </div>
          </div>

          <div className="chessboard" role="grid" aria-label="Chess board position">
            {rowIndices.map((row, rIdx) => (
              <div className="board-rank" role="row" key={row}>
                {colIndices.map((column, cIdx) => {
                  const piece = boardMatrix[row][column]
                  const square = `${files[column]}${8 - row}` as Square
                  const isLegal = destinations.has(square)
                  const isSelected = selected === square
                  return (
                    <button
                      type="button"
                      role="gridcell"
                      key={square}
                      aria-label={piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type} on ${square}` : `Empty ${square}`}
                      aria-selected={isSelected}
                      disabled={isCompleted || !myTurn || serverState.status !== 'active' || connection !== 'connected'}
                      className={`board-square ${(row + column) % 2 === 0 ? 'board-square--light' : 'board-square--dark'}${isSelected ? ' is-selected' : ''}${isLegal ? ' is-legal-target' : ''}`}
                      onClick={() => clickSquare(square)}
                    >
                      {piece && <span className={`chess-piece chess-piece--${piece.color}`} aria-hidden="true">{symbols[`${piece.color}${piece.type}`]}</span>}
                      {isLegal && !piece && <span className="legal-dot" aria-hidden="true" />}
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
                  <span className="player-strip-name">
                    <strong>{myLabel}</strong>
                  </span>
                </div>
                <div className="player-strip-sub">
                  <span>{isWhite ? 'White Pieces' : 'Black Pieces'}</span>
                  <span>·</span>
                  <span className={myTurn && !isCompleted ? 'text-lime' : 'text-muted'}>
                    {isCompleted ? 'Game Concluded' : myTurn ? 'Your Turn' : "Opponent's Turn"}
                  </span>
                </div>
              </div>
            </div>
            <div className={`player-strip-clock${myTurn && !isCompleted ? ' player-strip-clock--active' : ''}`}>
              {myTime}
            </div>
          </div>

          {/* Move replay controls for completed games */}
          {isCompleted && (
            <div className="replay-controls-bar" aria-label="Game replay controls">
              <div className="replay-btn-group">
                <button
                  type="button"
                  className="secondary-action replay-step-btn"
                  disabled={activePly === 0 || replayMoves.length === 0}
                  onClick={() => setReplayPly(0)}
                  aria-label="First move"
                  title="Start of game"
                >
                  ⏮
                </button>
                <button
                  type="button"
                  className="secondary-action replay-step-btn"
                  disabled={activePly === 0 || replayMoves.length === 0}
                  onClick={() => setReplayPly(Math.max(0, (activePly ?? 0) - 1))}
                  aria-label="Previous move"
                  title="Previous move"
                >
                  ◀
                </button>
                <button
                  type="button"
                  className="secondary-action replay-step-btn"
                  disabled={activePly === replayMoves.length || replayMoves.length === 0}
                  onClick={() => setReplayPly(Math.min(replayMoves.length, (activePly ?? 0) + 1))}
                  aria-label="Next move"
                  title="Next move"
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="secondary-action replay-step-btn"
                  disabled={activePly === replayMoves.length || replayMoves.length === 0}
                  onClick={() => setReplayPly(replayMoves.length)}
                  aria-label="Final position"
                  title="Final position"
                >
                  ⏭
                </button>
              </div>

              <div className="replay-step-info">
                {replayMoves.length === 0 ? (
                  <span>Final position (no recorded move replay)</span>
                ) : activePly === 0 ? (
                  <span>Starting position (ply 0 / {replayMoves.length})</span>
                ) : activePly === replayMoves.length ? (
                  <span>Final position · Ply {replayMoves.length} ({replayMoves[replayMoves.length - 1]?.san})</span>
                ) : (
                  <span>Move {Math.ceil((activePly ?? 1) / 2)}{(activePly ?? 1) % 2 === 1 ? ' (White)' : ' (Black)'}: <strong>{replayMoves[(activePly ?? 1) - 1]?.san}</strong></span>
                )}
              </div>
            </div>
          )}

          <div className="position-state" role="status">
            {isCompleted
              ? `${serverState.result} · ${formatTermination(serverState.termination)}`
              : `${displayBoard.turn() === 'w' ? 'White' : 'Black'} to move`}
          </div>

          {error && <div className="analysis-error" role="alert">{error}</div>}
        </section>

        <aside className="analysis-column">
          <section className="panel analysis-panel" aria-label="Game Panel">
            <div className="eyebrow">GAME ACTIONS &amp; MOVES</div>
            <h2>{isCompleted ? 'Final Outcome' : 'Controls'}</h2>
            {isCompleted ? (
              <div className="outcome-summary">
                <p className="game-result">
                  <strong>Result:</strong> {serverState.result} ({formatTermination(serverState.termination)})
                </p>
                <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
                  <Link to="/history" className="secondary-action" style={{ fontSize: '13px' }}>
                    ← Back to History
                  </Link>
                  <Link to="/play" className="primary-action" style={{ fontSize: '13px' }}>
                    Play Next Match
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <p className="analysis-intro">
                  {opponentUsername} {opponentConnected ? 'is connected' : 'is reconnecting or offline'}.
                </p>
                {serverState.draw_offered_by && (
                  <p className="queue-message">
                    {serverState.draw_offered_by === 'opponent' ? 'Your opponent offered a draw.' : 'You offered a draw.'}
                  </p>
                )}
                <div className="game-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {serverState.draw_offered_by === 'me' ? (
                    <button type="button" className="secondary-action" onClick={() => send({ type: 'action', action: 'withdraw_draw' })}>Withdraw offer</button>
                  ) : serverState.draw_offered_by === 'opponent' ? (
                    <>
                      <button type="button" className="primary-action" onClick={() => send({ type: 'action', action: 'accept_draw' })}>Accept draw</button>
                      <button type="button" className="secondary-action" onClick={() => send({ type: 'action', action: 'decline_draw' })}>Decline draw</button>
                    </>
                  ) : (
                    <button type="button" className="secondary-action" onClick={() => send({ type: 'action', action: 'offer_draw' })} disabled={serverState.status !== 'active'}>Offer draw</button>
                  )}
                  <button type="button" className="secondary-action btn-player-resign" onClick={() => send({ type: 'action', action: 'resign' })} disabled={serverState.status !== 'active'}>Resign</button>
                </div>
              </>
            )}

            {/* Compact Move List */}
            {replayMoves.length > 0 && (
              <div className="compact-moves-container" style={{ marginTop: '16px', maxHeight: '200px', overflowY: 'auto' }}>
                <span className="coach-card-label" style={{ display: 'block', marginBottom: '6px', fontSize: '12px' }}>Move History</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '4px', fontSize: '12px' }}>
                  {replayMoves.map((m, idx) => {
                    if (idx % 2 === 0) {
                      const moveNumber = Math.floor(idx / 2) + 1
                      const blackMove = replayMoves[idx + 1]
                      return (
                        <div key={idx} style={{ gridColumn: 'span 2', display: 'flex', gap: '8px' }}>
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
            )}
          </section>

          {isCompleted && <PerformancePanel report={report} gameId={gameId} />}
        </aside>
      </div>

      <GameOverModal
        isOpen={isCompleted && !modalDismissed}
        userWon={userWon}
        winner={winner}
        score={serverState.result ?? '1/2-1/2'}
        termination={formatTermination(serverState.termination)}
        onPlayAgain={() => { window.location.href = '/play' }}
        onClose={() => setModalDismissed(true)}
        reviewUrl={gameId ? `/report/${encodeURIComponent(gameId)}` : '/history'}
        opponentUsername={opponentUsername}
        opponentRating={opponentRating}
        isCasual={isCasual}
        userRating={myRating}
      />
    </div>
  )
}

function PerformancePanel({ report, gameId }: { report: PerformanceReport | null; gameId?: string }) {
  if (!report) {
    return (
      <section className="panel analysis-panel" aria-label="Post-game analysis">
        <div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div>
        <h2>Loading Report…</h2>
        <p className="analysis-intro">Retrieving saved game analysis…</p>
      </section>
    )
  }

  if (report.analysis_status === 'queued') {
    return (
      <section className="panel analysis-panel" aria-label="Post-game analysis">
        <div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div>
        <h2>Analysis Queued</h2>
        <p className="analysis-intro">
          This game is queued for engine evaluation. Stockfish post-game analysis runs via the background worker.
        </p>
        <div className="worker-info-callout">
          <strong>Worker Status: Queued</strong>
          <p>To run analysis on queued games, execute in the terminal:</p>
          <code>python -m backend.analysis_worker --once</code>
        </div>
      </section>
    )
  }

  if (report.analysis_status === 'processing') {
    return (
      <section className="panel analysis-panel" aria-label="Post-game analysis">
        <div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div>
        <h2>Analysis Processing</h2>
        <p className="analysis-intro">
          <span className="loading-pulse" /> Stockfish is evaluating moves and calculating accuracy…
        </p>
      </section>
    )
  }

  if (report.analysis_status === 'failed') {
    return (
      <section className="panel analysis-panel" aria-label="Post-game analysis">
        <div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div>
        <h2>Analysis Unavailable</h2>
        <p className="analysis-intro">
          {report.message || 'The post-game analysis job could not complete. No performance score was generated.'}
        </p>
      </section>
    )
  }

  return (
    <section className="panel analysis-panel" aria-label="Post-game Stockfish report">
      <div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div>
      <h2>Performance Report</h2>

      {report.stars === null ? (
        <p className="analysis-intro">
          Performance stars unavailable: {report.star_reason || 'Requires at least 8 centipawn-evaluable moves.'}
        </p>
      ) : (
        <div className="star-rating" aria-label={`${report.stars} out of 5 stars`}>
          <strong>{'★'.repeat(report.stars)}{'☆'.repeat(5 - report.stars)}</strong>
          <span>{report.star_reason}</span>
        </div>
      )}

      <div className="report-stats">
        <span>
          Accuracy estimate
          <strong>{report.accuracy_pct === null ? '—' : `${report.accuracy_pct.toFixed(1)}%`}</strong>
        </span>
        <span>
          Average CPL
          <strong>{report.average_cpl === null ? '—' : report.average_cpl.toFixed(1)}</strong>
        </span>
        <span>
          Best-move agreement
          <strong>{report.best_move_agreement_pct === null ? '—' : `${report.best_move_agreement_pct.toFixed(1)}%`}</strong>
        </span>
        <span>
          Blunders
          <strong className={report.blunders ? 'text-danger' : ''}>{report.blunders ?? '—'}</strong>
        </span>
        <span>
          Mistakes
          <strong>{report.mistakes ?? '—'}</strong>
        </span>
        <span>
          Inaccuracies
          <strong>{report.inaccuracies ?? '—'}</strong>
        </span>
      </div>

      <small className="report-footnote" style={{ display: 'block', marginTop: '10px', color: 'var(--color-subtle)', lineHeight: 1.4 }}>
        Accuracy formula: 100 × exp(−average CPL / 100). Evaluations are depth-based engine estimates, not ground truth.
      </small>

      {report.critical_moves && report.critical_moves.length > 0 && (
        <div className="report-critical" style={{ marginTop: '16px' }}>
          <h3>Critical Moves</h3>
          <div className="critical-moves-list">
            {report.critical_moves.map(move => (
              <div key={move.ply} className="critical-move-item">
                <span className="critical-ply">Ply {move.ply}</span>
                <span className="critical-played">{move.played_move}</span>
                <span className={`critical-class critical-class--${move.classification}`}>
                  {move.classification.replaceAll('_', ' ')}
                </span>
                <span className="critical-cpl">−{move.cpl} CPL</span>
                <span className="critical-best">Best: {move.best_move}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.recommendations && report.recommendations.length > 0 && (
        <div className="report-recommendations-wrapper" style={{ marginTop: '16px' }}>
          <h3>Coach Recommendations</h3>
          <ul className="report-recommendations">
            {report.recommendations.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {gameId && (
        <div style={{ marginTop: '20px' }}>
          <a
            href={`/report/${encodeURIComponent(gameId)}`}
            className="primary-action"
            style={{ display: 'block', textAlign: 'center', width: '100%', textDecoration: 'none' }}
          >
            Open Full Match Report & Analytics →
          </a>
        </div>
      )}
    </section>
  )
}

function displayedClock(base: number, state: MultiplayerGameState | null, color: 'w' | 'b', now: number) {
  const isTurn = state?.fen.split(' ')[1] === color
  const started = state?.turn_started_at ? new Date(state.turn_started_at).getTime() : now
  const remain = Math.max(0, base - (state?.status === 'active' && isTurn ? now - started : 0))
  const seconds = Math.ceil(remain / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatTermination(reason: string | null): string {
  if (!reason) return 'Game concluded'
  return reason.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())
}
