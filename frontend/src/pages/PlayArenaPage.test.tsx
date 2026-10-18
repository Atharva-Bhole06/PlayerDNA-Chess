import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PlayArenaPage } from './PlayArenaPage'
import { AuthContext } from '../context/AuthContext'
import type { AuthenticatedProfile } from '../api/types'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const authenticatedUser: AuthenticatedProfile = {
  username: 'ChessMaster',
  rating: 1540,
  games_played: 12,
  wins: 8,
  losses: 3,
  draws: 1,
  player_dna_status: 'tactical_swashbuckler',
  is_admin: false,
}

function renderArena(user: AuthenticatedProfile | null = null, initialEntry = '/play') {
  const dummyAuthValue = {
    user,
    loading: false,
    error: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
  }

  return render(
    <AuthContext.Provider value={dummyAuthValue}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/play" element={<PlayArenaPage />} />
          <Route path="/matchmaking" element={<div data-testid="matchmaking-screen">Matchmaking Queue</div>} />
          <Route path="/live-chess" element={<div data-testid="live-chess-screen">Live Chess Board</div>} />
          <Route path="/login" element={<div data-testid="login-screen">Login Portal</div>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('PlayArenaPage mode integration', () => {
  it('renders default unrated mode with PLAY CTA and routes to unrated live chess', () => {
    renderArena(null, '/play')

    const ctaButton = screen.getByRole('button', { name: /PLAY - Unrated · Practice/i })
    expect(ctaButton).toBeInTheDocument()

    // Launch game
    fireEvent.click(ctaButton)
    expect(screen.getByTestId('live-chess-screen')).toBeInTheDocument()
  })

  it('updates active mode, CTA label, and description when mode tabs are clicked', () => {
    renderArena(null, '/play')

    // Click AI mode tab
    fireEvent.click(screen.getByRole('button', { name: /Play AI Stockfish · 10\+10/i }))
    expect(screen.getByRole('button', { name: /PLAY AI - Stockfish · 10\+10/i })).toBeInTheDocument()
    expect(screen.getByText('Stockfish AI Engine')).toBeInTheDocument()

    // Click Coach mode tab
    fireEvent.click(screen.getByRole('button', { name: /Coach/i }))
    expect(screen.getByRole('button', { name: /PLAY WITH COACH - Engine Feedback/i })).toBeInTheDocument()
    expect(screen.getByText('Play with a Coach')).toBeInTheDocument()

    // Click Competitive mode tab
    fireEvent.click(screen.getByRole('button', { name: /Competitive/i }))
    expect(screen.getByRole('button', { name: /PLAY COMPETITIVE/i })).toBeInTheDocument()
    expect(screen.queryByText(/Friend/i)).not.toBeInTheDocument()
  })

  it('prompts guests to sign in when attempting to launch competitive matchmaking', () => {
    renderArena(null, '/play?mode=competitive')

    const ctaButton = screen.getByRole('button', { name: /PLAY COMPETITIVE/i })
    expect(ctaButton).toBeInTheDocument()

    fireEvent.click(ctaButton)

    // Modal dialog opens
    expect(screen.getByRole('heading', { name: 'Sign In Required for Competitive Play' })).toBeInTheDocument()
    expect(screen.getByText(/Competitive matchmaking pairs you with live opponents based on your established Elo rating/i)).toBeInTheDocument()

    // Direct sign in link is provided
    const signInLink = screen.getByRole('link', { name: 'Sign In to Play' })
    expect(signInLink).toHaveAttribute('href', '/login?from=/play?mode=competitive')
  })

  it('routes authenticated players directly to matchmaking when launching competitive mode', () => {
    renderArena(authenticatedUser, '/play?mode=competitive')

    const ctaButton = screen.getByRole('button', { name: /PLAY COMPETITIVE/i })
    fireEvent.click(ctaButton)

    expect(screen.getByTestId('matchmaking-screen')).toBeInTheDocument()
  })

  it('routes to AI mode on /live-chess?mode=ai when launching AI mode', () => {
    renderArena(null, '/play?mode=ai')

    const ctaButton = screen.getByRole('button', { name: /^PLAY AI -/i })
    fireEvent.click(ctaButton)

    expect(screen.getByTestId('live-chess-screen')).toBeInTheDocument()
  })

  it('routes to Coach mode on /live-chess?mode=coach when launching Coach mode', () => {
    renderArena(null, '/play?mode=coach')

    const ctaButton = screen.getByRole('button', { name: /PLAY WITH COACH/i })
    fireEvent.click(ctaButton)

    expect(screen.getByTestId('live-chess-screen')).toBeInTheDocument()
  })

  it('strictly excludes Friend mode from player-facing mode selector and options', () => {
    renderArena(null, '/play')

    expect(screen.queryByText(/Invite Friend/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Direct Challenge/i)).not.toBeInTheDocument()
  })

  it('synchronizes initial mode from URL search parameters (?mode=coach)', () => {
    renderArena(null, '/play?mode=coach')

    expect(screen.getByRole('button', { name: /PLAY WITH COACH/i })).toBeInTheDocument()
    expect(screen.getByText('Play with a Coach')).toBeInTheDocument()
  })
})
