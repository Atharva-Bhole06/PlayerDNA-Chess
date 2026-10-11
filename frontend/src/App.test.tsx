import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('application shell', () => {
  it('shows all four navigation destinations and the selected page', () => {
    render(<MemoryRouter initialEntries={['/player-dna']}><App /></MemoryRouter>)

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Overview/ })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /Player DNA/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /AI Matchmaking/ })).toHaveAttribute('href', '/matchmaking')
    expect(screen.getByRole('link', { name: /Live Chess & Analysis/ })).toHaveAttribute('href', '/live-chess')
    expect(screen.getByRole('heading', { name: 'Player DNA' })).toBeInTheDocument()
  })
})

describe('application routes', () => {
  it('routes to the implemented Live Chess board from primary navigation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', database_available: true, stockfish_available: false }), { status: 200 })))
    render(<MemoryRouter initialEntries={['/live-chess']}><App /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Live Chess & Analysis' })).toBeInTheDocument()
    expect(screen.getByRole('grid', { name: 'Chess board position' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary navigation' }).querySelector('a[href="/live-chess"]')).toHaveAttribute('href', '/live-chess')
  })
})
