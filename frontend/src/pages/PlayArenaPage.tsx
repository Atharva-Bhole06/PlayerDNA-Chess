import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Chess, type Square } from 'chess.js'
import { PlayModeSelector, type PlayMode } from '../components/PlayModeSelector'
import { IconRook, IconSliders, IconTrophy } from '../components/Icons'
import { useAuth } from '../context/AuthContext'

const files = 'abcdefgh'
const symbols: Record<string, string> = {
  wk: '♔', wq: '♕', wr: '♖', wb: '♗', wn: '♘', wp: '♙',
  bk: '♚', bq: '♛', br: '♜', bb: '♝', bn: '♞', bp: '♟'
}

export function PlayArenaPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [boardGame] = useState(() => new Chess())

  // Modal dialog states
  const [showAuthModal, setShowAuthModal] = useState(false)

  // Synchronize active mode with URL search parameters
  const validModes: PlayMode[] = ['unrated', 'competitive', 'ai', 'coach']
  const modeParam = searchParams.get('mode') as PlayMode | null
  const activeMode: PlayMode = modeParam && validModes.includes(modeParam) ? modeParam : 'unrated'

  const handleSelectMode = (mode: PlayMode) => {
    setSearchParams({ mode })
    setShowAuthModal(false)
  }

  // Calculate rating progress values
  const gamesPlayed = user ? user.games_played : 0
  const isProvisional = gamesPlayed < 3
  const progressStep = Math.min(gamesPlayed, 3)
  const displayRating = user ? user.rating : 1200

  // Configuration for each mode
  const modeConfig = {
    unrated: {
      ctaLabel: 'PLAY',
      ctaSublabel: 'Unrated · Practice',
      glowClass: 'ambient-glow--lime',
      buttonClass: 'cta-lime',
      pathTitle: "What's Your Chess Path?",
      pathDescription: 'Discover the best way for you to play, train, and improve.',
      pathAction: 'Quick Match',
      mascotText: null,
    },
    competitive: {
      ctaLabel: 'PLAY COMPETITIVE',
      ctaSublabel: 'Rated Queue · Elo Matched',
      glowClass: 'ambient-glow--lime',
      buttonClass: 'cta-lime',
      pathTitle: 'Competitive Matchmaking',
      pathDescription: 'Queue up against players of similar skill and establish your rank.',
      pathAction: 'Join Queue',
      mascotText: null,
    },
    ai: {
      ctaLabel: 'PLAY AI',
      ctaSublabel: 'Stockfish · 10+10',
      glowClass: 'ambient-glow--cyan',
      buttonClass: 'cta-cyan',
      pathTitle: 'Stockfish AI Engine',
      pathDescription: 'Challenge the integrated UCI engine configured for rapid play.',
      pathAction: 'Play Stockfish',
      mascotText: 'Stockfish 16 is ready for play.',
    },
    coach: {
      ctaLabel: 'PLAY WITH COACH',
      ctaSublabel: 'Engine Feedback',
      glowClass: 'ambient-glow--orange',
      buttonClass: 'cta-orange',
      pathTitle: 'Play with a Coach',
      pathDescription: 'Learn as you play, get useful tips, and improve move by move.',
      pathAction: 'Start Session',
      mascotText: "Hi, I'm the Coach. Let's learn chess by playing.",
    },
  }

  const currentConfig = modeConfig[activeMode] || modeConfig.unrated

  const handleLaunchGame = () => {
    if (activeMode === 'competitive') {
      if (!user) {
        setShowAuthModal(true)
        return
      }
      navigate('/matchmaking')
    } else if (activeMode === 'ai') {
      navigate('/live-chess?mode=ai')
    } else if (activeMode === 'coach') {
      navigate('/live-chess?mode=coach')
    } else {
      navigate('/live-chess?mode=unrated')
    }
  }

  return (
    <div className="arena-viewport">
      {/* Dynamic Ambient Glow matching active mode */}
      <div className={`ambient-glow ${currentConfig.glowClass}`} aria-hidden="true" />

      <div className="arena-main-content">
        {/* Left Progress Column (Scaled for comfortable desktop readability) */}
        <aside className="arena-side-col arena-left-col">
          <div className="rating-progress-floating">
            <h3 className="side-col-title">Keep it up!</h3>
            <p className="side-col-subtitle">Play a few more<br />to see where you stand</p>

            <div className="progress-dial-wrapper">
              <svg className="progress-dial-svg" viewBox="0 0 160 160">
                <circle
                  cx="80"
                  cy="80"
                  r="66"
                  className="dial-track"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="66"
                  className="dial-fill"
                  style={{
                    strokeDasharray: 414.7,
                    strokeDashoffset: 414.7 - (414.7 * progressStep) / 3,
                  }}
                />
              </svg>
              <div className="dial-content">
                <span className="dial-eyebrow">RATING</span>
                <span className="dial-status">{isProvisional ? 'Estimated' : 'Established'}</span>
                <strong className="dial-rating">{isProvisional ? `${progressStep} of 3` : displayRating}</strong>
                <small className="dial-hint">
                  {isProvisional ? 'Play 3 games to estimate' : 'Active competitive rank'}
                </small>
              </div>
            </div>

            <div className="arena-sub-stat-pill">
              <IconRook size={16} className="sub-stat-icon" aria-hidden="true" />
              <span className="sub-stat-label">Games Played</span>
              <strong className="sub-stat-value">{gamesPlayed}</strong>
            </div>

          </div>
        </aside>

        {/* Center Board Column */}
        <section className="arena-center-col" aria-label="Interactive chess board">
          <div className="arena-board-frame">
            <div className="chessboard" role="grid" aria-label="Chess board position">
              {boardGame.board().map((row, rankIndex) => (
                <div key={rankIndex} className="board-rank" role="row">
                  {row.map((piece, fileIndex) => {
                    const square = `${files[fileIndex]}${8 - rankIndex}` as Square
                    const isDark = (rankIndex + fileIndex) % 2 === 1
                    return (
                      <div
                        key={square}
                        role="gridcell"
                        aria-label={square}
                        className={`board-square ${isDark ? 'board-square--dark' : 'board-square--light'}`}
                      >
                        {fileIndex === 0 && (
                          <span className="board-coordinate board-coordinate--rank">
                            {8 - rankIndex}
                          </span>
                        )}
                        {rankIndex === 7 && (
                          <span className="board-coordinate board-coordinate--file">
                            {files[fileIndex]}
                          </span>
                        )}
                        {piece && (
                          <span className={`chess-piece chess-piece--${piece.color}`}>
                            {symbols[`${piece.color}${piece.type}`]}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* Vignette Shadow Overlay (Matches reference atmospheric lighting) */}
            <div className="board-vignette" aria-hidden="true" />

            {/* Central Overlay Action Banner Button */}
            <div className="board-cta-overlay">
              <button
                type="button"
                className={`board-cta-btn ${currentConfig.buttonClass}`}
                onClick={handleLaunchGame}
                aria-label={`${currentConfig.ctaLabel} - ${currentConfig.ctaSublabel}`}
              >
                <span className="cta-btn-main">{currentConfig.ctaLabel}</span>
                <span className="cta-btn-sub">
                  <IconSliders size={13} className="cta-slider-icon" aria-hidden="true" />
                  <span>{currentConfig.ctaSublabel}</span>
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Right Coach / Mascot Column */}
        <aside className="arena-side-col arena-right-col">
          <div className="mascot-context-floating">
            {currentConfig.mascotText && (
              <div className="coach-speech-bubble">
                <p>{currentConfig.mascotText}</p>
              </div>
            )}

            {/* Mode Graphic Emblem (Replaces hand mascot) */}
            <div className="mode-art-container" aria-hidden="true">
              <div className="mode-art-badge">
                <span className="mode-art-symbol">
                  {activeMode === 'ai' ? '♞' : activeMode === 'coach' ? '♗' : activeMode === 'competitive' ? '♔' : '⚔'}
                </span>
              </div>
            </div>

            <h4 className="side-col-title">{currentConfig.pathTitle}</h4>
            <p className="side-col-subtitle">{currentConfig.pathDescription}</p>

            <button
              type="button"
              className={`floating-action-pill ${activeMode === 'coach' ? 'btn-orange' : 'btn-lime'}`}
              onClick={handleLaunchGame}
            >
              {currentConfig.pathAction}
            </button>
          </div>
        </aside>
      </div>

      {/* Naturally Integrated Horizontal Play-Mode Selector */}
      <div className="arena-selector-container">
        <PlayModeSelector
          activeMode={activeMode}
          onSelectMode={handleSelectMode}
        />
      </div>

      {/* Guest Authentication Prompt Modal for Competitive Mode */}
      {showAuthModal && (
        <div className="arena-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <div className="arena-modal-card panel">
            <div className="modal-icon-badge" aria-hidden="true">
              <IconTrophy size={28} />
            </div>
            <h3 id="auth-modal-title">Sign In Required for Competitive Play</h3>
            <p>
              Competitive matchmaking pairs you with live opponents based on your established Elo rating.
              Please sign in or create a player account to enter the competitive queue.
            </p>
            <div className="modal-btn-group">
              <Link to="/login?from=/play?mode=competitive" className="primary-action">
                Sign In to Play
              </Link>
              <button
                type="button"
                className="secondary-action"
                onClick={() => setShowAuthModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
