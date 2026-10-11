import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Chess, type Square } from 'chess.js'
import { ApiError, getMultiplayerGame, getPerformanceReport, openGameSocket } from '../api/client'
import type { MultiplayerGameState, PerformanceReport } from '../api/types'

const files = 'abcdefgh'
const symbols: Record<string, string> = { wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙', bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟' }

export function MultiplayerGame({ gameId }: { gameId: string }) {
  const [serverState, setServerState] = useState<MultiplayerGameState | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'reconnecting' | 'failed'>('connecting')
  const [opponentConnected, setOpponentConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(Date.now())
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const gameRef = useRef(new Chess())

  useEffect(() => {
    let stopped = false
    let retry: ReturnType<typeof setTimeout> | null = null
    let attempts = 0
    const connect = () => {
      if (stopped) return
      setConnection(attempts === 0 ? 'connecting' : 'reconnecting')
      let socket: WebSocket
      try { socket = openGameSocket(gameId) }
      catch (e) { setConnection('failed'); setError(e instanceof Error ? e.message : 'Unable to open game connection'); return }
      socketRef.current = socket
      socket.onopen = () => { attempts = 0; setConnection('connected'); setError(null) }
      socket.onmessage = event => {
        try {
          const message = JSON.parse(String(event.data)) as { type?: string; game?: MultiplayerGameState; detail?: string; opponent_connected?: boolean }
          if (message.type === 'error') { setError(message.detail ?? 'Game action could not be applied'); return }
          if (message.game) { gameRef.current = new Chess(message.game.fen); setServerState(message.game); setSelected(null) }
          if (typeof message.opponent_connected === 'boolean') setOpponentConnected(message.opponent_connected)
        } catch { setError('Received an invalid update from the game server') }
      }
      socket.onerror = () => setConnection('reconnecting')
      socket.onclose = event => {
        socketRef.current = null
        if (stopped) return
        if (event.code === 4401 || event.code === 4403 || event.code === 4404) {
          setConnection('failed')
          setError(event.reason || 'You cannot access this game.')
          return
        }
        attempts += 1
        retry = setTimeout(connect, Math.min(5000, 500 * 2 ** Math.min(attempts, 4)))
      }
    }
    void getMultiplayerGame(gameId).then(state => { if (!stopped) { gameRef.current = new Chess(state.fen); setServerState(state) } })
      .catch(e => { if (!stopped) setError(e instanceof ApiError && e.status === 404 ? 'This game does not exist.' : e instanceof Error ? e.message : 'Unable to load game') })
    connect()
    const ticker = setInterval(() => setTick(Date.now()), 1000)
    return () => { stopped = true; clearInterval(ticker); if (retry) clearTimeout(retry); socketRef.current?.close() }
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
        if (value.analysis_status === 'queued' || value.analysis_status === 'processing') timer = setTimeout(() => void refresh(), 3000)
      } catch (e) {
        if (!stopped) setError(e instanceof Error ? e.message : 'Unable to load game report')
      }
    }
    void refresh()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [gameId, serverState?.status])

  const game = useMemo(() => new Chess(serverState?.fen), [serverState?.fen])
  const destinations = useMemo(() => selected ? new Set(game.moves({ square: selected, verbose: true }).map(move => move.to)) : new Set<Square>(), [game, selected])
  const color = serverState?.color === 'white' ? 'w' : 'b'
  const myTurn = game.turn() === color
  const send = (payload: object) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) { setError('Reconnecting to the game server…'); return }
    socketRef.current.send(JSON.stringify(payload)); setError(null)
  }
  const clickSquare = (square: Square) => {
    if (!serverState || serverState.status !== 'active' || !myTurn) return
    const piece = game.get(square)
    if (selected && destinations.has(square)) {
      try {
        const move = game.move({ from: selected, to: square, ...(piece?.type === 'p' && square[1] === (color === 'w' ? '8' : '1') ? { promotion: 'q' } : {}) })
        send({ type: 'move', uci: `${move.from}${move.to}${move.promotion ?? ''}`, expected_ply: serverState.ply_count })
      } catch { setError('That move is not legal.') }
      setSelected(null)
      return
    }
    if (piece?.color === color) { setSelected(square); setError(null) }
    else setSelected(null)
  }
  const whiteTime = displayedClock(serverState?.white_time_ms ?? 0, serverState, 'w', tick)
  const blackTime = displayedClock(serverState?.black_time_ms ?? 0, serverState, 'b', tick)

  if (!serverState) return <div className="page-wrap"><header className="page-header"><div><div className="eyebrow">MULTIPLAYER GAME</div><h1>Live Chess</h1></div></header><section className="state-panel" role={error ? 'alert' : 'status'}>{error ?? 'Restoring the saved game…'}{error && <> <Link to="/account">Open account</Link></>}</section></div>

  const whiteName = `${serverState.white_username} · ${serverState.white_rating}`
  const blackName = `${serverState.black_username} · ${serverState.black_rating}`
  return <div className="page-wrap live-page multiplayer-page">
    <header className="page-header"><div><div className="eyebrow">PERSISTED MULTIPLAYER GAME</div><h1>{serverState.status === 'completed' ? 'Game complete' : 'Live Chess'}</h1><p>Moves are validated and stored by the game server. Your color is {serverState.color}.</p></div><span className={`phase-badge ${connection === 'connected' ? '' : 'engine-badge--unavailable'}`}><span className="phase-dot" />{connection.toUpperCase()}</span></header>
    <div className="live-layout">
      <section className="board-panel panel" aria-label="Multiplayer chessboard">
        <div className="player-strip"><span>{blackName}<small>{opponentConnected ? 'Opponent connection active' : 'Opponent disconnected'}</small></span><strong>{blackTime}</strong></div>
        <div className="chessboard" role="grid" aria-label="Chess board position">
          {game.board().map((rank, row) => <div className="board-rank" role="row" key={row}>{rank.map((piece, column) => {
            const square = `${files[column]}${8 - row}` as Square
            const isLegal = destinations.has(square)
            const isSelected = selected === square
            return <button type="button" role="gridcell" key={square} aria-label={piece ? `${piece.color === 'w' ? 'White' : 'Black'} ${piece.type} on ${square}` : `Empty ${square}`} aria-selected={isSelected} disabled={!myTurn || serverState.status !== 'active' || connection !== 'connected'} className={`board-square ${(row + column) % 2 === 0 ? 'board-square--light' : 'board-square--dark'}${isSelected ? ' is-selected' : ''}${isLegal ? ' is-legal-target' : ''}`} onClick={() => clickSquare(square)}>
              {piece && <span className={`chess-piece chess-piece--${piece.color}`} aria-hidden="true">{symbols[`${piece.color}${piece.type}`]}</span>}{isLegal && !piece && <span className="legal-dot" aria-hidden="true" />}{column === 0 && <span className="board-coordinate board-coordinate--rank" aria-hidden="true">{8-row}</span>}{row === 7 && <span className="board-coordinate board-coordinate--file" aria-hidden="true">{files[column]}</span>}
            </button>
          })}</div>)}
        </div>
        <div className="player-strip"><span>{whiteName}<small>{myTurn ? 'Your turn' : serverState.status === 'active' ? 'Opponent to move' : 'Game finished'}</small></span><strong>{whiteTime}</strong></div>
        <div className="position-state" role="status">{serverState.status === 'completed' ? `${serverState.result} · ${serverState.termination}` : `${game.turn() === 'w' ? 'White' : 'Black'} to move`}</div>
        {error && <div className="analysis-error" role="alert">{error}</div>}
      </section>
      <aside className="analysis-column">
        <section className="panel analysis-panel"><div className="eyebrow">GAME CONTROLS</div><h2>{serverState.status === 'completed' ? 'Result' : 'Opponent'}</h2>
          {serverState.status === 'completed' ? <p className="game-result">{serverState.result} · {serverState.termination}</p> : <>
            <p className="analysis-intro">{serverState.color === 'white' ? serverState.black_username : serverState.white_username} {opponentConnected ? 'is connected' : 'is reconnecting or offline'}.</p>
            {serverState.draw_offered_by && <p className="queue-message">{serverState.draw_offered_by === 'opponent' ? 'Your opponent offered a draw.' : 'You offered a draw.'}</p>}
            <div className="game-actions">{serverState.draw_offered_by === 'me' ? <button className="secondary-action" onClick={() => send({ type: 'action', action: 'withdraw_draw' })}>Withdraw offer</button> : serverState.draw_offered_by === 'opponent' ? <><button className="secondary-action" onClick={() => send({ type: 'action', action: 'accept_draw' })}>Accept draw</button><button className="secondary-action" onClick={() => send({ type: 'action', action: 'decline_draw' })}>Decline draw</button></> : <button className="secondary-action" onClick={() => send({ type: 'action', action: 'offer_draw' })}>Offer draw</button>}<button className="secondary-action" onClick={() => send({ type: 'action', action: 'resign' })}>Resign</button></div>
          </>}
          <label className="fen-label" htmlFor="saved-fen">Saved position</label><textarea id="saved-fen" className="fen-display" readOnly value={serverState.fen} rows={2} />
          <label className="fen-label" htmlFor="saved-pgn">Recorded PGN</label><textarea id="saved-pgn" className="fen-display" readOnly value={serverState.pgn} rows={5} />
        </section>
        {serverState.status === 'completed' && <PerformancePanel report={report} />}
      </aside>
    </div>
  </div>
}

function PerformancePanel({ report }: { report: PerformanceReport | null }) {
  if (!report) return <section className="panel analysis-panel"><div className="eyebrow">POST-GAME ANALYSIS</div><h2>Queued</h2><p className="analysis-intro">Loading the saved game report…</p></section>
  if (report.analysis_status === 'queued' || report.analysis_status === 'processing') return <section className="panel analysis-panel"><div className="eyebrow">POST-GAME ANALYSIS</div><h2>{report.analysis_status === 'queued' ? 'Queued' : 'Processing'}</h2><p className="analysis-intro">{report.message} Engine results will appear here when analysis completes.</p></section>
  if (report.analysis_status === 'failed') return <section className="panel analysis-panel"><div className="eyebrow">POST-GAME ANALYSIS</div><h2>Analysis unavailable</h2><p className="analysis-intro">{report.message ?? 'The game could not be analyzed. No performance score was generated.'}</p></section>
  return <section className="panel analysis-panel"><div className="eyebrow">POST-GAME STOCKFISH ANALYSIS</div><h2>Performance report</h2>
    {report.stars === null ? <p className="analysis-intro">Performance stars unavailable: {report.star_reason}</p> : <div className="star-rating" aria-label={`${report.stars} out of 5 stars`}><strong>{'★'.repeat(report.stars)}{'☆'.repeat(5-report.stars)}</strong><span>{report.star_reason}</span></div>}
    <div className="report-stats"><span>Average CPL<strong>{report.average_cpl === null ? '—' : report.average_cpl.toFixed(1)}</strong></span><span>Accuracy estimate<strong>{report.accuracy_pct === null ? '—' : `${report.accuracy_pct.toFixed(1)}%`}</strong></span><span>Blunders<strong>{report.blunders ?? '—'}</strong></span><span>Best-move agreement<strong>{report.best_move_agreement_pct === null ? '—' : `${report.best_move_agreement_pct.toFixed(1)}%`}</strong></span></div>
    <small>Accuracy formula: 100 × exp(−average CPL / 100). Evaluations are engine-depth estimates, not ground truth.</small>
    {report.critical_moves && report.critical_moves.length > 0 && <div className="report-critical"><h3>Critical moves</h3>{report.critical_moves.map(move => <p key={move.ply}>Ply {move.ply}: {move.played_move} · {move.cpl} CPL · best was {move.best_move}</p>)}</div>}
    {report.recommendations && <ul className="report-recommendations">{report.recommendations.map(item => <li key={item}>{item}</li>)}</ul>}
  </section>
}

function displayedClock(base: number, state: MultiplayerGameState | null, color: 'w' | 'b', now: number) {
  const isTurn = state?.fen.split(' ')[1] === color
  const started = state?.turn_started_at ? new Date(state.turn_started_at).getTime() : now
  const remain = Math.max(0, base - (state?.status === 'active' && isTurn ? now - started : 0))
  const seconds = Math.ceil(remain / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
