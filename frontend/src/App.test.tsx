import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('application shell', () => {
  it('shows player navigation destinations and renders the public landing page at root', () => {
    render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>)

    const nav = screen.getByRole('navigation', { name: 'Primary navigation' })
    expect(nav).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /^Play/ })).toHaveAttribute('href', '/play')
    expect(within(nav).getByRole('link', { name: /Dashboard/ })).toHaveAttribute('href', '/dashboard')
    expect(within(nav).getByRole('link', { name: /Game History/ })).toHaveAttribute('href', '/history')
    expect(within(nav).queryByRole('link', { name: /Research Portal/ })).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: /Demo/i })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Play Chess with Behavioral Style Intelligence/ })).toBeInTheDocument()
  })

  it('renders the central play arena at /play', () => {
    render(<MemoryRouter initialEntries={['/play']}><App /></MemoryRouter>)
    expect(screen.getByRole('button', { name: /PLAY/ })).toBeInTheDocument()
  })

  it('renders research navigation when within research area', () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/players')) {
        return Promise.resolve(new Response(JSON.stringify([{ player_id: 'Ada', games_analyzed: 10, mean_player_rating: 1800, win_rate_pct: 60 }]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok', database_available: true, stockfish_available: false }), { status: 200 }))
    }))

    render(<MemoryRouter initialEntries={['/research/player-dna']}><App /></MemoryRouter>)
    expect(screen.getByRole('link', { name: /Player DNA/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /Cohort Matching/ })).toHaveAttribute('href', '/matchmaking')
    expect(screen.getByRole('link', { name: /Research Overview/ })).toHaveAttribute('href', '/research')
  })
})

describe('application routes', () => {
  it('routes to the implemented Live Chess board from primary navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', database_available: true, stockfish_available: false }), { status: 200 })))
    render(<MemoryRouter initialEntries={['/live-chess']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Live Chess & Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Chess board position' })).toBeInTheDocument()
  })

  it('renders login page on /login and redirects unauthenticated users accessing /dashboard', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/auth/me')) return Promise.resolve(new Response(JSON.stringify({ detail: 'Authentication required' }), { status: 401 }))
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok', database_available: true, stockfish_available: false }), { status: 200 }))
    }))

    render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /Sign In/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument()
  })

  it('renders research portal at /research', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
      if (url.endsWith('/api/players')) {
        return Promise.resolve(new Response(JSON.stringify([{ player_id: 'Ada', games_analyzed: 10, mean_player_rating: 1800, win_rate_pct: 60 }]), { status: 200 }))
      }
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok', database_available: true, stockfish_available: false }), { status: 200 }))
    }))
    render(<MemoryRouter initialEntries={['/research']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Research & Datasets' })).toBeInTheDocument()
    expect(screen.getByText(/Historical 30-player research cohort/)).toBeInTheDocument()
  })
})
