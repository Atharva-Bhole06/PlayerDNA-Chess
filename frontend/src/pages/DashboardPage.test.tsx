import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardPage } from './DashboardPage'
import { AuthContext } from '../context/AuthContext'
import type { AuthenticatedProfile, LeaderboardEntry, RecentGame } from '../api/types'
import * as client from '../api/client'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const establishedUser: AuthenticatedProfile = {
  username: 'ChessMaster',
  rating: 1540,
  games_played: 12,
  wins: 8,
  losses: 3,
  draws: 1,
  player_dna_status: 'tactical_swashbuckler',
  is_admin: false,
}

const newUser: AuthenticatedProfile = {
  username: 'FreshPlayer',
  rating: 1200,
  games_played: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  player_dna_status: 'pending_games',
  is_admin: false,
}

function renderWithAuth(ui: React.ReactElement, user: AuthenticatedProfile | null = establishedUser) {
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
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('DashboardPage', () => {
  it('renders personal statistics from real authenticated user data', async () => {
    vi.spyOn(client, 'getLeaderboard').mockResolvedValue([])
    vi.spyOn(client, 'getRecentGames').mockResolvedValue([])

    renderWithAuth(<DashboardPage />, establishedUser)

    expect(screen.getByRole('heading', { name: /Welcome, ChessMaster/i })).toBeInTheDocument()
    expect(screen.getByText('1540')).toBeInTheDocument()
    expect(screen.getByText('Established Elo')).toBeInTheDocument()
    expect(screen.getByText('8W · 3L · 1D')).toBeInTheDocument()
    expect(screen.getByText('67% Win Rate')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText(/tactical swashbuckler/i)).toBeInTheDocument()

    // Does not show new-account onboarding banner
    expect(screen.queryByText(/Ready for your first match\?/i)).not.toBeInTheDocument()
  })

  it('handles new accounts with clean empty states without cohort data', async () => {
    vi.spyOn(client, 'getLeaderboard').mockResolvedValue([])
    vi.spyOn(client, 'getRecentGames').mockResolvedValue([])

    renderWithAuth(<DashboardPage />, newUser)

    expect(screen.getByRole('heading', { name: /Welcome, FreshPlayer/i })).toBeInTheDocument()
    expect(screen.getByText(/Ready for your first match\?/i)).toBeInTheDocument()
    expect(screen.getByText('1200')).toBeInTheDocument()
    expect(screen.getByText('Provisional (0/5 games)')).toBeInTheDocument()
    expect(screen.getByText('0W · 0L · 0D')).toBeInTheDocument()
    expect(screen.getByText('No matches recorded')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText(/Requires 3\+ analyzed matches/i)).toBeInTheDocument()

    // Confirms no research-cohort names exist
    expect(screen.queryByText(/Ada/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Mira/)).not.toBeInTheDocument()
  })

  it('renders the top 3 leaderboard with rank, rating, and details', async () => {
    const mockLeaderboard: LeaderboardEntry[] = [
      { rank: 1, username: 'GrandmasterA', rating: 1850, games_played: 20, wins: 15, losses: 3, draws: 2, win_rate: 0.75 },
      { rank: 2, username: 'PlayerTwo', rating: 1600, games_played: 10, wins: 6, losses: 3, draws: 1, win_rate: 0.6 },
      { rank: 3, username: 'PlayerThree', rating: 1450, games_played: 8, wins: 4, losses: 3, draws: 1, win_rate: 0.5 },
      { rank: 4, username: 'PlayerFour', rating: 1300, games_played: 5, wins: 2, losses: 2, draws: 1, win_rate: 0.4 },
    ]
    vi.spyOn(client, 'getLeaderboard').mockResolvedValue(mockLeaderboard)
    vi.spyOn(client, 'getRecentGames').mockResolvedValue([])

    renderWithAuth(<DashboardPage />)

    expect(await screen.findByText('GrandmasterA')).toBeInTheDocument()
    expect(screen.getByText('1850 Elo')).toBeInTheDocument()
    expect(screen.getByText(/20 games · 15W · 3L \(75%\)/)).toBeInTheDocument()

    expect(screen.getByText('PlayerTwo')).toBeInTheDocument()
    expect(screen.getByText('1600 Elo')).toBeInTheDocument()

    expect(screen.getByText('PlayerThree')).toBeInTheDocument()
    expect(screen.getByText('1450 Elo')).toBeInTheDocument()

    // 4th player should NOT be rendered in top 3
    expect(screen.queryByText('PlayerFour')).not.toBeInTheDocument()
  })

  it('renders leaderboard empty state and error state with retry', async () => {
    vi.spyOn(client, 'getRecentGames').mockResolvedValue([])
    vi.spyOn(client, 'getLeaderboard')
      .mockRejectedValueOnce(new Error('Leaderboard service offline'))
      .mockResolvedValueOnce([])

    renderWithAuth(<DashboardPage />)

    // Error state
    expect(await screen.findByText('Leaderboard service offline')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    expect(retryBtn).toBeInTheDocument()

    // Click retry -> empty state
    fireEvent.click(retryBtn)
    expect(await screen.findByText(/No registered players ranked yet/i)).toBeInTheDocument()
  })

  it('renders recent games list with opponent, result, rating change, and report link', async () => {
    const mockGames: RecentGame[] = [
      {
        game_id: 'game-1234',
        opponent_username: 'RivalKnight',
        opponent_rating: 1510,
        color: 'white',
        result: 'win',
        termination: 'checkmate',
        rating_before: 1524,
        rating_after: 1540,
        rating_change: 16,
        finished_at: '2026-10-11T12:00:00Z',
        analysis_status: 'completed',
        stars: 4,
      },
    ]

    vi.spyOn(client, 'getLeaderboard').mockResolvedValue([])
    vi.spyOn(client, 'getRecentGames').mockResolvedValue(mockGames)

    renderWithAuth(<DashboardPage />)

    expect(await screen.findByText(/vs RivalKnight \(1510\)/)).toBeInTheDocument()
    expect(screen.getByText(/as White · checkmate/)).toBeInTheDocument()
    expect(screen.getByText('WIN (+16)')).toBeInTheDocument()
    expect(screen.getByText('4 ★')).toBeInTheDocument()

    const reportLink = screen.getByRole('link', { name: /Report →/i })
    expect(reportLink).toHaveAttribute('href', '/live-chess?game=game-1234')
  })

  it('renders recent games empty state and error state with retry', async () => {
    vi.spyOn(client, 'getLeaderboard').mockResolvedValue([])
    vi.spyOn(client, 'getRecentGames')
      .mockRejectedValueOnce(new Error('Match history unavailable'))
      .mockResolvedValueOnce([])

    renderWithAuth(<DashboardPage />)

    // Error state
    expect(await screen.findByText('Match history unavailable')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: 'Retry' })
    expect(retryBtn).toBeInTheDocument()

    // Click retry -> empty state
    fireEvent.click(retryBtn)
    expect(await screen.findByText(/No games played yet on this account/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start Your First Game/i })).toHaveAttribute('href', '/play')
  })

  it('provides navigation to the 5 supported modes and excludes Tournament and Puzzle', async () => {
    vi.spyOn(client, 'getLeaderboard').mockResolvedValue([])
    vi.spyOn(client, 'getRecentGames').mockResolvedValue([])

    renderWithAuth(<DashboardPage />)

    // Primary action
    const playCta = screen.getByRole('link', { name: /Open Play Arena →/i })
    expect(playCta).toHaveAttribute('href', '/play')

    // 4 Supported modes (Friend mode removed per requirements)
    expect(screen.getByRole('heading', { name: /Play Casual|Play Unrated/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Competitive Matchmaking' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Play Stockfish AI' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Coach Mode/ })).toBeInTheDocument()
    expect(screen.queryByText(/Play with a Friend/i)).not.toBeInTheDocument()

    // Check mode links
    expect(screen.getByRole('link', { name: /Play Casual|Play Unrated/i })).toHaveAttribute('href', '/play?mode=unrated')
    expect(screen.getByRole('link', { name: /Competitive Matchmaking/ })).toHaveAttribute('href', '/play?mode=competitive')
    expect(screen.getByRole('link', { name: /Play Stockfish AI/ })).toHaveAttribute('href', '/play?mode=ai')

    // Absolutely NO Tournament or Puzzle
    expect(screen.queryByText(/Tournament/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/Puzzle/i)).not.toBeInTheDocument()
  })
})
