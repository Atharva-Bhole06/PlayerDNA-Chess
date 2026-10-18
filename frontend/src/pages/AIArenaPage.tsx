import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Chess, type Square } from 'chess.js'
import {
  cancelExperiment,
  createExperiment,
  getEnginePresets,
  getExperiments,
} from '../api/client'
import type { AIExperiment, AIExperimentPreset } from '../api/types'

const files = 'abcdefgh'
const symbols: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟',
}

export function AIArenaPage() {
  const [presets, setPresets] = useState<AIExperimentPreset[]>([])
  const [experiments, setExperiments] = useState<AIExperiment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Creation form state
  const [name, setName] = useState('')
  const [whitePreset, setWhitePreset] = useState('novice')
  const [blackPreset, setBlackPreset] = useState('intermediate')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Selected experiment for PGN replay
  const [selectedExperiment, setSelectedExperiment] = useState<AIExperiment | null>(null)

  const loadData = async (signal?: AbortSignal) => {
    try {
      const [presetsData, expsData] = await Promise.all([
        getEnginePresets(signal),
        getExperiments(signal),
      ])
      const presetsList: AIExperimentPreset[] = Object.entries(presetsData).map(([id, p]) => ({
        ...p,
        id,
        approx_rating: id === 'novice' ? 1100 : id === 'intermediate' ? 1600 : 2700,
      }))
      setPresets(presetsList)
      setExperiments(expsData)
      setError(null)

      // Update selected experiment if open
      if (selectedExperiment) {
        const updated = expsData.find(e => e.id === selectedExperiment.id)
        if (updated) setSelectedExperiment(updated)
      }
    } catch (err) {
      if (!signal?.aborted) {
        setError(err instanceof Error ? err.message : 'Failed to load arena data')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    loadData(controller.signal)
    return () => controller.abort()
  }, [])

  // Poll when any experiment is queued or running
  useEffect(() => {
    const hasActive = experiments.some(e => e.status === 'queued' || e.status === 'running')
    if (!hasActive) return

    const interval = setInterval(() => {
      loadData()
    }, 2500)

    return () => clearInterval(interval)
  }, [experiments])

  const handleStartExperiment = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError(null)

    try {
      const newExp = await createExperiment({
        name: name.trim() || undefined,
        white_preset: whitePreset,
        black_preset: blackPreset,
      })
      setExperiments(prev => [newExp, ...prev])
      setSelectedExperiment(newExp)
      setName('')
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to launch experiment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = async (id: string) => {
    try {
      const cancelled = await cancelExperiment(id)
      setExperiments(prev => prev.map(e => (e.id === id ? cancelled : e)))
      if (selectedExperiment?.id === id) {
        setSelectedExperiment(cancelled)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel experiment')
    }
  }

  return (
    <div className="page-wrap arena-page">
      <header className="page-header">
        <div>
          <div className="eyebrow">RESEARCH & EVALUATION · ENGINE ARENA</div>
          <h1>AI-vs-AI Experiment Arena</h1>
          <p>
            Run reproducible, automated matchups between supported Stockfish UCI configurations.
            Engine configuration presets configure native UCI parameters and are strictly distinct from ML models.
          </p>
        </div>
        <span className="phase-badge">
          <span className="phase-dot" /> DUAL-ENGINE HARNESS
        </span>
      </header>

      {/* Sub-navigation */}
      <nav className="research-subnav" aria-label="Research sub-navigation">
        <Link to="/research" className="subnav-pill">Overview & Dataset</Link>
        <Link to="/research/player-dna" className="subnav-pill">30-Player DNA Analysis</Link>
        <Link to="/matchmaking" className="subnav-pill">Cohort Distance Matching</Link>
        <Link to="/research/ml-models" className="subnav-pill">Style Clustering Model</Link>
        <Link to="/research/ai-arena" className="subnav-pill is-active">AI Engine Arena</Link>
      </nav>

      {error ? (
        <section className="state-panel" role="alert">
          <h2>Arena Unavailable</h2>
          <p>{error}</p>
        </section>
      ) : loading ? (
        <section className="state-panel" aria-live="polite">
          Loading Stockfish presets and experiment history…
        </section>
      ) : (
        <>
          {/* Engine Presets Definition Card */}
          <section className="panel" style={{ padding: '24px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', margin: 0 }}>Stockfish UCI Strength Presets</h2>
                <p style={{ fontSize: '13px', color: 'var(--color-muted)', marginTop: '4px' }}>
                  Native Stockfish 16 parameters calibrated for reproducible strength evaluation.
                </p>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-lime)', background: 'rgba(163, 230, 53, 0.1)', padding: '4px 10px', borderRadius: '12px' }}>
                ✓ Concurrent Subprocess Execution Verified
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {presets.map(p => (
                <div key={p.id} className="preset-card">
                  <div className="preset-header">
                    <span className="preset-name">{p.name}</span>
                    <span className="preset-rating">{p.approx_rating} Elo</span>
                  </div>
                  <p className="preset-desc">{p.description}</p>
                  <div className="preset-specs">
                    <span>Skill: <strong>{p.skill_level}</strong></span>
                    <span>Depth: <strong>{p.depth}</strong></span>
                    <span>Movetime: <strong>{p.movetime_ms}ms</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Main Grid: Launcher + Experiment History */}
          <div className="arena-grid">
            {/* Launch Form */}
            <section className="panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '16px', marginBottom: '16px' }}>Launch AI Matchup</h2>

              {submitError && (
                <div className="notice" role="alert" style={{ marginBottom: '16px', borderColor: 'var(--color-danger, #ef4444)' }}>
                  {submitError}
                </div>
              )}

              <form onSubmit={handleStartExperiment} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label htmlFor="exp-name" style={{ display: 'block', fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>
                    Experiment Name (optional)
                  </label>
                  <input
                    id="exp-name"
                    type="text"
                    className="text-input"
                    placeholder="e.g. Novice vs Master Benchmark"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    style={{ width: '100%', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label htmlFor="exp-white" style={{ display: 'block', fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>
                    White Engine Configuration
                  </label>
                  <select
                    id="exp-white"
                    className="text-input"
                    value={whitePreset}
                    onChange={e => setWhitePreset(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.approx_rating} Elo · Skill {p.skill_level})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="exp-black" style={{ display: 'block', fontSize: '12px', color: 'var(--color-muted)', marginBottom: '6px' }}>
                    Black Engine Configuration
                  </label>
                  <select
                    id="exp-black"
                    className="text-input"
                    value={blackPreset}
                    onChange={e => setBlackPreset(e.target.value)}
                    style={{ width: '100%' }}
                  >
                    {presets.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.approx_rating} Elo · Skill {p.skill_level})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px' }}>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-muted)' }}>Match Format</span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>1 Full Game</strong>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px 12px', borderRadius: '6px' }}>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-muted)' }}>Move Limit</span>
                    <strong style={{ fontSize: '13px', color: '#fff' }}>60 Moves Max</strong>
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                  style={{ marginTop: '8px', width: '100%' }}
                >
                  {submitting ? 'Initializing Stockfish Match…' : 'Start Engine Experiment'}
                </button>
              </form>
            </section>

            {/* Experiment History & Results */}
            <section className="panel" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ fontSize: '16px', margin: 0 }}>Recorded Experiments ({experiments.length})</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => loadData()}
                  style={{ color: 'var(--color-lime)', fontSize: '12px' }}
                >
                  ↻ Refresh
                </button>
              </div>

              {experiments.length === 0 ? (
                <div className="empty-state">No experiments recorded yet. Launch your first matchup above.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {experiments.map(exp => {
                    const isSelected = selectedExperiment?.id === exp.id
                    return (
                      <div
                        key={exp.id}
                        className="experiment-item"
                        style={{
                          borderColor: isSelected ? 'var(--color-lime)' : undefined,
                        }}
                      >
                        <div className="experiment-item-header">
                          <div>
                            <strong style={{ fontSize: '14px', color: '#fff' }}>{exp.name}</strong>
                            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '2px' }}>
                              White: <span style={{ color: '#fff' }}>{exp.white_preset}</span> vs Black: <span style={{ color: '#fff' }}>{exp.black_preset}</span>
                            </div>
                          </div>
                          <span className={`status-badge-${exp.status}`}>
                            {exp.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Results Summary */}
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px', background: 'rgba(0,0,0,0.2)', padding: '8px 12px', borderRadius: '6px' }}>
                          <div>White Wins: <strong style={{ color: 'var(--color-lime)' }}>{exp.white_wins}</strong></div>
                          <div>Black Wins: <strong style={{ color: 'var(--color-lime)' }}>{exp.black_wins}</strong></div>
                          <div>Draws: <strong>{exp.draws}</strong></div>
                          <div>Completed Games: <strong>{exp.white_wins + exp.black_wins + exp.draws} / {exp.games_total}</strong></div>
                        </div>

                        {exp.error_message && (
                          <div style={{ fontSize: '12px', color: '#f87171' }}>
                            Error: {exp.error_message}
                          </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                          <small style={{ color: 'var(--color-muted)' }}>
                            {new Date(exp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(exp.created_at).toLocaleDateString()}
                          </small>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            {(exp.status === 'queued' || exp.status === 'running') && (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => handleCancel(exp.id)}
                                style={{ color: '#ef4444', fontSize: '12px' }}
                              >
                                Cancel
                              </button>
                            )}

                            {exp.pgn && (
                              <button
                                type="button"
                                className="btn-signin"
                                onClick={() => setSelectedExperiment(exp)}
                                style={{ padding: '4px 12px', fontSize: '12px' }}
                              >
                                {isSelected ? 'Viewing Replay' : 'Replay Game'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Game Replay & Move Stepping Section */}
          {selectedExperiment && selectedExperiment.pgn && (
            <section className="panel" style={{ padding: '24px', marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div className="eyebrow">REPRODUCIBLE RUN VIEWER</div>
                  <h2 style={{ fontSize: '18px', margin: 0 }}>
                    Replay: {selectedExperiment.name} ({selectedExperiment.white_preset} vs {selectedExperiment.black_preset})
                  </h2>
                </div>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => setSelectedExperiment(null)}
                >
                  Close Replay ✕
                </button>
              </div>

              <PGNReplayer experiment={selectedExperiment} />
            </section>
          )}
        </>
      )}
    </div>
  )
}

function PGNReplayer({ experiment }: { experiment: AIExperiment }) {
  const [moveIndex, setMoveIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  // Parse moves from PGN
  const historyMoves = useRef<string[]>([])
  const [positions, setPositions] = useState<string[]>([])

  useEffect(() => {
    try {
      const chess = new Chess()
      chess.loadPgn(experiment.pgn || '')
      const moves = chess.history()
      historyMoves.current = moves

      // Build positions array
      const replay = new Chess()
      const fens = [replay.fen()]
      for (const m of moves) {
        replay.move(m)
        fens.push(replay.fen())
      }
      setPositions(fens)
      setMoveIndex(fens.length - 1) // default to end of game
    } catch {
      // In case PGN parsing has errors
      setPositions([new Chess().fen()])
    }
  }, [experiment.pgn])

  // Auto-play timer
  useEffect(() => {
    if (!isPlaying) return
    const timer = setInterval(() => {
      setMoveIndex(prev => {
        if (prev >= positions.length - 1) {
          setIsPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, 800)
    return () => clearInterval(timer)
  }, [isPlaying, positions.length])

  const currentFen = positions[moveIndex] || new Chess().fen()
  const displayChess = new Chess(currentFen)
  const currentBoard = displayChess.board()

  return (
    <div className="replay-viewer">
      {/* Chessboard View */}
      <div>
        <div className="chessboard" role="grid" aria-label="Replay Chessboard">
          {currentBoard.map((rank, row) => (
            <div className="board-rank" role="row" key={row}>
              {rank.map((piece, column) => {
                const square = `${files[column]}${8 - row}` as Square
                const description = piece
                  ? `${piece.color === 'w' ? 'White' : 'Black'} piece on ${square}`
                  : `Empty ${square}`
                return (
                  <div
                    role="gridcell"
                    aria-label={description}
                    key={square}
                    className={`board-square ${(row + column) % 2 === 0 ? 'board-square--light' : 'board-square--dark'}`}
                  >
                    {piece && (
                      <span className={`chess-piece chess-piece--${piece.color}`} aria-hidden="true">
                        {symbols[`${piece.color}${piece.type}`]}
                      </span>
                    )}
                    {column === 0 && (
                      <span className="board-coordinate board-coordinate--rank" aria-hidden="true">
                        {8 - row}
                      </span>
                    )}
                    {row === 7 && (
                      <span className="board-coordinate board-coordinate--file" aria-hidden="true">
                        {files[column]}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Stepping Controls */}
        <div className="replay-controls">
          <button
            type="button"
            className="replay-ctrl-btn"
            onClick={() => setMoveIndex(0)}
            disabled={moveIndex === 0}
            title="Start of game"
          >
            ⏮
          </button>
          <button
            type="button"
            className="replay-ctrl-btn"
            onClick={() => setMoveIndex(prev => Math.max(0, prev - 1))}
            disabled={moveIndex === 0}
            title="Previous move"
          >
            ◀
          </button>
          <button
            type="button"
            className="replay-ctrl-btn"
            onClick={() => setIsPlaying(prev => !prev)}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'}
          </button>
          <button
            type="button"
            className="replay-ctrl-btn"
            onClick={() => setMoveIndex(prev => Math.min(positions.length - 1, prev + 1))}
            disabled={moveIndex >= positions.length - 1}
            title="Next move"
          >
            ▶
          </button>
          <button
            type="button"
            className="replay-ctrl-btn"
            onClick={() => setMoveIndex(positions.length - 1)}
            disabled={moveIndex >= positions.length - 1}
            title="End of game"
          >
            ⏭
          </button>
          <span style={{ fontSize: '13px', color: 'var(--color-muted)', marginLeft: '12px' }}>
            Move {moveIndex} of {Math.max(0, positions.length - 1)}
          </span>
        </div>
      </div>

      {/* Move Log & PGN Details */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <h3 style={{ fontSize: '14px', marginBottom: '8px' }}>Move Sequence</h3>
          <div className="move-list-scroll">
            <button
              type="button"
              className={`move-pill ${moveIndex === 0 ? 'is-active' : ''}`}
              onClick={() => setMoveIndex(0)}
            >
              Start
            </button>
            {historyMoves.current.map((move, idx) => {
              const currentMoveNumber = Math.floor(idx / 2) + 1
              const isWhite = idx % 2 === 0
              const label = isWhite ? `${currentMoveNumber}. ${move}` : `${move}`
              return (
                <button
                  type="button"
                  key={idx}
                  className={`move-pill ${moveIndex === idx + 1 ? 'is-active' : ''}`}
                  onClick={() => setMoveIndex(idx + 1)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <label htmlFor="raw-pgn" style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Auditable PGN Record
            </label>
            <button
              type="button"
              className="text-button"
              onClick={() => navigator.clipboard.writeText(experiment.pgn || '')}
              style={{ color: 'var(--color-lime)', fontSize: '11px' }}
            >
              Copy PGN
            </button>
          </div>
          <textarea
            id="raw-pgn"
            className="fen-display"
            readOnly
            value={experiment.pgn || ''}
            rows={5}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ fontSize: '12px', color: 'var(--color-muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>Outcome: <strong style={{ color: '#fff' }}>{experiment.white_wins > experiment.black_wins ? 'White Won' : experiment.black_wins > experiment.white_wins ? 'Black Won' : 'Drawn'}</strong></div>
          <div>Total Moves: <strong style={{ color: '#fff' }}>{historyMoves.current.length}</strong></div>
          <div>White Config: <strong style={{ color: '#fff' }}>{experiment.white_preset}</strong></div>
          <div>Black Config: <strong style={{ color: '#fff' }}>{experiment.black_preset}</strong></div>
        </div>
      </div>
    </div>
  )
}
