import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OverviewPage } from './OverviewPage'
import { PlayerDNAPage } from './PlayerDNAPage'

const players = [{ player_id: 'Ada', games_analyzed: 10, mean_player_rating: 1800, win_rate_pct: 60 }, { player_id: 'Mira', games_analyzed: null, mean_player_rating: null, win_rate_pct: null }]
const profile = { ...players[0], record: { wins: 6, draws: 2, losses: 2 }, performance: { mean_accuracy_pct: 91, games_as_white: 5 }, player_dna: { median_cpl: 14, cpl_std: null, inaccuracies_per_100_cp_moves: 3, version: 'v1' } }
function response(value: unknown, status = 200) { return new Response(JSON.stringify(value), { status }) }
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('overview page', () => {
  it('shows calculated metrics and profile links', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => response(url.endsWith('/health') ? { status: 'ok', database_available: true, stockfish_available: false } : players)))
    render(<MemoryRouter><OverviewPage /></MemoryRouter>)
    expect(await screen.findByText('2')).toBeInTheDocument()
    expect(screen.getByText('1800')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ada/ })).toHaveAttribute('href', '/player-dna?player=Ada')
  })
  it('shows empty and API error states', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => response(url.endsWith('/health') ? { status: 'ok', database_available: true, stockfish_available: false } : [])))
    const { unmount } = render(<MemoryRouter><OverviewPage /></MemoryRouter>)
    expect(await screen.findByText('No players are currently available.')).toBeInTheDocument()
    unmount()
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    render(<MemoryRouter><OverviewPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('backend could not be reached')
  })
})

describe('Player DNA page', () => {
  it('loads profile details, renders null DNA explicitly, and supports selection', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/players')) return response(players)
      return response(url.endsWith('/Ada') ? profile : { ...profile, player_id: 'Mira' })
    }))
    render(<MemoryRouter initialEntries={['/player-dna?player=Ada']}><Routes><Route path="/player-dna" element={<PlayerDNAPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Ada' })).toBeInTheDocument()
    expect(screen.getByText('Measurement unavailable')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Select player'), { target: { value: 'Mira' } })
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mira' })).toBeInTheDocument())
  })
  it('reports player API errors and handles empty cohort', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const { unmount } = render(<MemoryRouter><PlayerDNAPage /></MemoryRouter>)
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    unmount()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([])))
    render(<MemoryRouter><PlayerDNAPage /></MemoryRouter>)
    expect(await screen.findByText('No players available')).toBeInTheDocument()
  })

  it('preserves cached player selection when navigating back without query parameters', async () => {
    sessionStorage.setItem('playerdna_last_selected_player', 'Mira')
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/players')) return response(players)
      return response({ ...profile, player_id: 'Mira' })
    }))

    render(<MemoryRouter initialEntries={['/player-dna']}><Routes><Route path="/player-dna" element={<PlayerDNAPage />} /></Routes></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Mira' })).toBeInTheDocument()
    sessionStorage.removeItem('playerdna_last_selected_player')
  })
})
