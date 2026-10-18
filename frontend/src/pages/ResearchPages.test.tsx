import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchPortalPage } from './ResearchPortalPage'
import { AIArenaPage } from './AIArenaPage'
import { MLModelsPage } from './MLModelsPage'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { AuthContext } from '../context/AuthContext'
import type { AIExperiment, AIExperimentPreset, AuthenticatedProfile, MLStatusResponse } from '../api/types'

function mockResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const mockPresets: AIExperimentPreset[] = [
  {
    name: 'Stockfish Novice',
    description: 'Recreational strength with bounded depth and limited tactical lookahead.',
    skill_level: 3,
    depth: 5,
    movetime_ms: 60,
    threads: 1,
    hash_mb: 16,
    approx_rating: 1100,
  },
  {
    name: 'Stockfish Intermediate',
    description: 'Club-level tactical consistency and solid move evaluation.',
    skill_level: 10,
    depth: 8,
    movetime_ms: 100,
    threads: 1,
    hash_mb: 16,
    approx_rating: 1600,
  },
  {
    name: 'Stockfish Master',
    description: 'Tournament-grade depth and deep calculation.',
    skill_level: 20,
    depth: 12,
    movetime_ms: 150,
    threads: 1,
    hash_mb: 16,
    approx_rating: 2700,
  },
]

const mockPresetsRecord: Record<string, AIExperimentPreset> = {
  novice: mockPresets[0],
  intermediate: mockPresets[1],
  master: mockPresets[2],
}

const mockExperiments: AIExperiment[] = [
  {
    id: 'exp-1',
    name: 'Novice vs Intermediate Match',
    white_preset: 'novice',
    black_preset: 'intermediate',
    white_config: mockPresets[0],
    black_config: mockPresets[1],
    games_total: 1,
    status: 'completed' as const,
    white_wins: 0,
    black_wins: 1,
    draws: 0,
    pgn: '1. e4 e5 2. Nf3 Nc6 0-1',
    final_fen: null,
    termination: 'checkmate',
    error_message: null,
    created_at: '2026-10-11T12:00:00Z',
    started_at: '2026-10-11T12:00:01Z',
    completed_at: '2026-10-11T12:00:05Z',
  },
]

const mockMLStatus: MLStatusResponse = {
  status: 'insufficient_data',
  analyzed_users_count: 0,
  required_users_count: 10,
  message: 'Insufficient live player data: 0/10 eligible registered players with >= 3 analyzed games.',
  active_model: null,
}

const mockPlayers = [
  { player_id: 'Historical_Ada', games_analyzed: 12, mean_player_rating: 2100, win_rate_pct: 65 },
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Research Security & RBAC Routing', () => {
  const normalUser: AuthenticatedProfile = {
    username: 'player_joe',
    rating: 1200,
    games_played: 5,
    wins: 2,
    losses: 2,
    draws: 1,
    player_dna_status: 'calibrating',
    is_admin: false,
  }

  const adminUser: AuthenticatedProfile = {
    username: 'admin_alice',
    rating: 1500,
    games_played: 20,
    wins: 15,
    losses: 3,
    draws: 2,
    player_dna_status: 'verified',
    is_admin: true,
  }

  it('denies ordinary player access to admin-required routes with 403 explanation', () => {
    render(
      <AuthContext.Provider
        value={{
          user: normalUser,
          loading: false,
          error: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          refreshUser: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <MemoryRouter>
          <ProtectedRoute requireAdmin>
            <div>Restricted Admin Content</div>
          </ProtectedRoute>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByText(/403 Forbidden — Administrator Privileges Required/i)).toBeInTheDocument()
    expect(screen.getByText(/player_joe/i)).toBeInTheDocument()
    expect(screen.queryByText('Restricted Admin Content')).not.toBeInTheDocument()
  })

  it('permits authorized admin user access to admin-required routes', () => {
    render(
      <AuthContext.Provider
        value={{
          user: adminUser,
          loading: false,
          error: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          refreshUser: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <MemoryRouter>
          <ProtectedRoute requireAdmin>
            <div>Restricted Admin Content</div>
          </ProtectedRoute>
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(screen.getByText('Restricted Admin Content')).toBeInTheDocument()
    expect(screen.queryByText(/403 Forbidden/i)).not.toBeInTheDocument()
  })
})

describe('ResearchPortalPage', () => {
  it('displays 403 Forbidden when research API denies access', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/health')) return Promise.resolve(mockResponse({ status: 'ok', database_available: true, stockfish_available: true }))
      return Promise.resolve(mockResponse({ detail: 'Administrator privileges required' }, 403))
    }))

    render(
      <AuthContext.Provider
        value={{
          user: { username: 'player_joe', rating: 1200, games_played: 0, wins: 0, losses: 0, draws: 0, player_dna_status: 'calibrating', is_admin: false },
          loading: false,
          error: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          refreshUser: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <MemoryRouter>
          <ResearchPortalPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText(/403 Forbidden — Administrator Privileges Required/i)).toBeInTheDocument()
    expect(screen.getByText(/python -m backend.manage_admin promote player_joe/i)).toBeInTheDocument()
  })

  it('renders research metrics, ML status, and experiment counts when authorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/health')) return Promise.resolve(mockResponse({ status: 'ok', database_available: true, stockfish_available: true }))
      if (url.includes('/api/players')) return Promise.resolve(mockResponse(mockPlayers))
      if (url.includes('/api/research/ml/status')) return Promise.resolve(mockResponse(mockMLStatus))
      if (url.includes('/api/research/experiments')) return Promise.resolve(mockResponse(mockExperiments))
      return Promise.resolve(mockResponse({}))
    }))

    render(
      <AuthContext.Provider
        value={{
          user: { username: 'admin_alice', rating: 1500, games_played: 10, wins: 8, losses: 2, draws: 0, player_dna_status: 'verified', is_admin: true },
          loading: false,
          error: null,
          login: vi.fn(),
          register: vi.fn(),
          logout: vi.fn(),
          refreshUser: vi.fn(),
          clearError: vi.fn(),
        }}
      >
        <MemoryRouter>
          <ResearchPortalPage />
        </MemoryRouter>
      </AuthContext.Provider>,
    )

    expect(await screen.findByText('Historical_Ada')).toBeInTheDocument()
    expect(screen.getByText('K-Means Style Clustering Model')).toBeInTheDocument()
    expect(screen.getByText('Data Prerequisite Unmet')).toBeInTheDocument()
    expect(screen.getByText('AI-vs-AI Experiment Arena')).toBeInTheDocument()
  })
})

describe('AIArenaPage', () => {
  it('renders presets, displays experiments, and supports PGN stepping', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/research/engine-presets')) return Promise.resolve(mockResponse(mockPresetsRecord))
      if (url.includes('/api/research/experiments')) return Promise.resolve(mockResponse(mockExperiments))
      return Promise.resolve(mockResponse({}))
    }))

    render(
      <MemoryRouter>
        <AIArenaPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Stockfish Novice')).toBeInTheDocument()
    expect(screen.getByText('Stockfish Intermediate')).toBeInTheDocument()
    expect(screen.getByText('Stockfish Master')).toBeInTheDocument()
    expect(screen.getByText('Novice vs Intermediate Match')).toBeInTheDocument()

    // Click Replay Game
    fireEvent.click(screen.getByRole('button', { name: /Replay Game/i }))

    expect(await screen.findByText(/Replay: Novice vs Intermediate Match/i)).toBeInTheDocument()
    expect(screen.getByText('1. e4')).toBeInTheDocument()
    expect(screen.getByText('e5')).toBeInTheDocument()

    // Test stepping controls
    const prevBtn = screen.getByTitle('Previous move')
    fireEvent.click(prevBtn)
    expect(screen.getByText(/Move \d of \d/i)).toBeInTheDocument()

    const startBtn = screen.getByTitle('Start of game')
    fireEvent.click(startBtn)
    expect(screen.getByText('Move 0 of 4')).toBeInTheDocument()
  })

  it('allows launching a new experiment', async () => {
    const createdExp: AIExperiment = {
      ...mockExperiments[0],
      id: 'exp-new',
      name: 'Test Tournament',
      status: 'queued',
      white_wins: 0,
      black_wins: 0,
      draws: 0,
      pgn: '',
    }

    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/research/engine-presets')) return Promise.resolve(mockResponse(mockPresetsRecord))
      if (url.includes('/api/research/experiments') && init?.method === 'POST') {
        return Promise.resolve(mockResponse(createdExp, 201))
      }
      if (url.includes('/api/research/experiments')) return Promise.resolve(mockResponse(mockExperiments))
      return Promise.resolve(mockResponse({}))
    }))

    render(
      <MemoryRouter>
        <AIArenaPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Stockfish Novice')).toBeInTheDocument()

    const nameInput = screen.getByLabelText(/Experiment Name/i)
    fireEvent.change(nameInput, { target: { value: 'Test Tournament' } })

    fireEvent.click(screen.getByRole('button', { name: /Start Engine Experiment/i }))

    await waitFor(() => {
      expect(screen.getByText('Test Tournament')).toBeInTheDocument()
      expect(screen.getByText('QUEUED')).toBeInTheDocument()
    })
  })
})

describe('MLModelsPage', () => {
  it('displays accurate ML clustering prerequisites and features without fabricated data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/research/ml/status')) return Promise.resolve(mockResponse(mockMLStatus))
      return Promise.resolve(mockResponse({}))
    }))

    render(
      <MemoryRouter>
        <MLModelsPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Player Style Clustering Model/i)).toBeInTheDocument()
    expect(screen.getByText(/Unmet Prerequisites/i)).toBeInTheDocument()
    expect(screen.getByText(/Eligible Live Players:/i)).toBeInTheDocument()
    expect(screen.getByText(/of 10 required/i)).toBeInTheDocument()
    expect(screen.getByText('median_cpl')).toBeInTheDocument()
    expect(screen.getByText('cpl_std')).toBeInTheDocument()
    expect(screen.getByText('inaccuracies_per_100_cp_moves')).toBeInTheDocument()
    expect(screen.getByText(/Cluster 0 · Tactical \/ Sharp/i)).toBeInTheDocument()
    expect(screen.getByText(/Cluster 1 · Positional \/ Classical/i)).toBeInTheDocument()
    expect(screen.getByText(/Cluster 2 · Dynamic \/ Universal/i)).toBeInTheDocument()
  })
})
