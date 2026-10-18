import { IconTrophy } from './Icons'

export interface GameOverModalProps {
  isOpen: boolean
  userWon: boolean | null // true: 'You won', false: 'You lost', null: 'Draw'
  winner: string // e.g. 'White', 'Black', 'Draw'
  score: string // '1-0', '0-1', '1/2-1/2'
  termination: string // e.g. 'Checkmate', 'Resignation', 'Stalemate', 'Timeout'
  onPlayAgain: () => void
  onClose?: () => void
  reviewUrl?: string
  opponentUsername?: string
  opponentRating?: number | string
  isCasual?: boolean
  ratingChange?: number
  userRating?: number
}

export function GameOverModal({
  isOpen,
  userWon,
  winner,
  score,
  termination,
  onPlayAgain,
  onClose,
  reviewUrl,
  opponentUsername,
  opponentRating,
  isCasual,
  ratingChange,
  userRating,
}: GameOverModalProps) {
  if (!isOpen) return null

  const headingText = userWon === true ? 'You Won!' : userWon === false ? 'You Lost' : 'Game Drawn'
  const headingClass = userWon === true ? 'text-lime' : userWon === false ? 'text-loss' : 'text-draw'

  let explanation = ''
  if (userWon === null || winner === 'Draw') {
    explanation = `Drawn by ${termination || 'mutual agreement'} (${score})`
  } else {
    explanation = `${winner} won by ${termination || 'conclusion'} (${score})`
  }

  return (
    <div
      className="arena-modal-backdrop game-over-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
    >
      <div className="arena-modal-card panel game-over-card">
        {onClose && (
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        )}

        <div className="game-over-icon-wrap" aria-hidden="true">
          <IconTrophy size={44} className={userWon === true ? 'icon-trophy-win' : 'icon-trophy-neutral'} />
        </div>

        <h2 id="game-over-title" className={`game-over-heading ${headingClass}`}>
          {headingText}
        </h2>

        <p className="game-over-explanation">{explanation}</p>

        {/* Player & Match Context */}
        <div className="game-over-meta-row">
          {opponentUsername && (
            <div className="game-over-meta-item">
              <span>Opponent</span>
              <strong>{opponentUsername} {opponentRating ? `(${opponentRating})` : ''}</strong>
            </div>
          )}
          <div className="game-over-meta-item">
            <span>Result Score</span>
            <strong>{score}</strong>
          </div>
          {isCasual ? (
            <div className="game-over-meta-item">
              <span>Rating Impact</span>
              <strong className="text-muted">Unrated (Casual)</strong>
            </div>
          ) : userRating !== undefined ? (
            <div className="game-over-meta-item">
              <span>Rating</span>
              <strong>
                {userRating}{' '}
                {ratingChange !== undefined && (
                  <span className={ratingChange >= 0 ? 'text-lime' : 'text-danger'}>
                    ({ratingChange >= 0 ? `+${ratingChange}` : ratingChange})
                  </span>
                )}
              </strong>
            </div>
          ) : null}
        </div>

        <div className="game-over-actions">
          {reviewUrl && (
            <a href={reviewUrl} className="primary-action btn-game-over-review">
              Game Review
            </a>
          )}

          <button
            type="button"
            className="secondary-action btn-game-over-play-again"
            onClick={onPlayAgain}
          >
            Play Again
          </button>

          <a href="/play" className="secondary-action btn-game-over-back" onClick={onClose}>
            Play Arena
          </a>
        </div>
      </div>
    </div>
  )
}
