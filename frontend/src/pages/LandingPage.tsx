import { Link } from 'react-router'
import { useAuth } from '../context/AuthContext'
import {
  IconAI,
  IconCoach,
  IconFriend,
  IconSwords,
  IconTrophy,
} from '../components/Icons'

export function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="landing-viewport">
      {/* Ambient Radial Backlight */}
      <div className="ambient-glow ambient-glow--lime" aria-hidden="true" />

      {/* Hero Section */}
      <section className="landing-hero" aria-label="PlayerDNA Platform Introduction">
        <div className="landing-hero-inner">
          <div className="landing-eyebrow">CHESS INTELLIGENCE PLATFORM</div>
          <h1 className="landing-title">
            Play Chess with Behavioral Style Intelligence & Engine Guidance
          </h1>
          <p className="landing-subtitle">
            PlayerDNA pairs real-time competitive chess with centipawn analysis, behavioral style modeling,
            and Stockfish UCI evaluation. Challenge other players, train against the AI, or practice with live coach feedback.
          </p>

          <div className="landing-cta-cluster">
            {user ? (
              <>
                <Link to="/dashboard" className="landing-btn-primary">
                  Enter Player Dashboard →
                </Link>
                <Link to="/play" className="landing-btn-secondary">
                  Launch Play Arena
                </Link>
              </>
            ) : (
              <>
                <Link to="/signup" className="landing-btn-primary">
                  Register for Free
                </Link>
                <Link to="/play" className="landing-btn-secondary">
                  Play Chess Arena
                </Link>
                <Link to="/login" className="landing-btn-tertiary">
                  Sign In
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Supported Game Modes Section */}
      <section className="landing-modes-section" aria-label="Supported game modes">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">MODES & GAMEPLAY</div>
          <h2>Supported Chess Modes</h2>
          <p>Choose the playing style and time controls that fit your game</p>
        </div>

        <div className="landing-modes-grid">
          <div className="landing-mode-card">
            <div className="landing-mode-icon mode-lime" aria-hidden="true">
              <IconSwords size={24} />
            </div>
            <h3>Unrated Play</h3>
            <p>Casual games with standard 10+10 time control. Ideal for tactical experimentation without rating stakes.</p>
            <Link to="/play" className="landing-card-link">Play Unrated →</Link>
          </div>

          <div className="landing-mode-card">
            <div className="landing-mode-icon mode-lime" aria-hidden="true">
              <IconTrophy size={24} />
            </div>
            <h3>Competitive Matchmaking</h3>
            <p>Rated multiplayer matchmaking using server-validated pairing and Elo rating adjustments.</p>
            <Link to={user ? "/matchmaking" : "/login"} className="landing-card-link">Queue Ranked →</Link>
          </div>

          <div className="landing-mode-card">
            <div className="landing-mode-icon mode-cyan" aria-hidden="true">
              <IconAI size={24} />
            </div>
            <h3>Stockfish AI</h3>
            <p>Test your calculation against the integrated Stockfish UCI engine configured for rapid chess play.</p>
            <Link to="/play" className="landing-card-link">Challenge Engine →</Link>
          </div>

          <div className="landing-mode-card">
            <div className="landing-mode-icon mode-orange" aria-hidden="true">
              <IconCoach size={24} />
            </div>
            <h3>Coach Feedback</h3>
            <p>Real-time move evaluation and positional cues to catch tactical inaccuracies as they happen.</p>
            <Link to="/play" className="landing-card-link">Start Session →</Link>
          </div>

          <div className="landing-mode-card">
            <div className="landing-mode-icon mode-emerald" aria-hidden="true">
              <IconFriend size={24} />
            </div>
            <h3>Play with a Friend</h3>
            <p>Create a private room with a dedicated share link for 1-on-1 friendly matches.</p>
            <Link to="/play" className="landing-card-link">Create Room →</Link>
          </div>
        </div>
      </section>

      {/* Product Intelligence Architecture */}
      <section className="landing-features-section" aria-label="Platform intelligence features">
        <div className="landing-section-header">
          <div className="landing-section-eyebrow">INTELLIGENCE ARCHITECTURE</div>
          <h2>How PlayerDNA Intelligence Works</h2>
          <p>Real machine learning and centipawn metrics applied to actual games</p>
        </div>

        <div className="landing-steps-grid">
          <div className="landing-step-card">
            <span className="step-number">01</span>
            <h3>Server-Side Move Evaluation</h3>
            <p>Every played move is verified by the server engine. Centipawn losses (CPL) and tactical blunders are recorded persistently.</p>
          </div>

          <div className="landing-step-card">
            <span className="step-number">02</span>
            <h3>Behavioral Player DNA</h3>
            <p>Style fingerprints compute median CPL, risk profiles, recovery ability, and tactical tendencies rather than a simple rating number.</p>
          </div>

          <div className="landing-step-card">
            <span className="step-number">03</span>
            <h3>Research Cohort Benchmarking</h3>
            <p>Separate research portal benchmarks player performance against historical datasets and 30-player baseline cohorts.</p>
          </div>
        </div>
      </section>

      {/* Bottom Conversion Banner */}
      <section className="landing-bottom-cta">
        <div className="bottom-cta-inner">
          <h2>Ready to Begin?</h2>
          <p>Register a free profile to track your Elo rating, game history, and style evolution.</p>
          <div className="bottom-cta-actions">
            {user ? (
              <Link to="/dashboard" className="landing-btn-primary">
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link to="/signup" className="landing-btn-primary">
                  Create Free Account
                </Link>
                <Link to="/login" className="landing-btn-secondary">
                  Sign In
                </Link>
              </>
            )}
            <Link to="/play" className="landing-btn-tertiary">
              Play Arena Directly
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
