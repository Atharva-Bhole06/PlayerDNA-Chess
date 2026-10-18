import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthPage } from './AuthPage'
import { AuthProvider } from '../context/AuthContext'

function mockAuthApi() {
  const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url.includes('/api/auth/me')) {
      return Promise.resolve(new Response(JSON.stringify({ detail: 'Unauthenticated' }), { status: 401 }))
    }
    if (url.includes('/api/auth/login')) {
      const body = JSON.parse(String(init?.body))
      return Promise.resolve(
        new Response(
          JSON.stringify({
            username: body.username,
            rating: 1200,
            games_played: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            player_dna_status: 'none',
            is_admin: false,
          }),
          { status: 200 }
        )
      )
    }
    return Promise.reject(new Error(`Unhandled URL: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('AuthPage pattern validation & login submission', () => {
  it('renders a pattern attribute that compiles cleanly without browser regex syntax errors', async () => {
    mockAuthApi()
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AuthPage initialMode="login" />
        </MemoryRouter>
      </AuthProvider>
    )

    const usernameInput = await screen.findByPlaceholderText(/Username/i) as HTMLInputElement
    const pattern = usernameInput.getAttribute('pattern')
    expect(pattern).toBeTruthy()

    // Ensure the pattern is a valid regular expression in modern Unicode / /v regex mode
    expect(() => new RegExp(`^(?:${pattern})$`, 'v')).not.toThrow()
    const compiled = new RegExp(`^(?:${pattern})$`, 'v')

    // Valid usernames according to backend schema: letters, numbers, dot, underscore, dash
    expect(compiled.test('TestUser')).toBe(true)
    expect(compiled.test('player_1')).toBe(true)
    expect(compiled.test('player-one')).toBe(true)
    expect(compiled.test('player.dna')).toBe(true)

    // Invalid usernames
    expect(compiled.test('bad player')).toBe(false)
    expect(compiled.test('bad@player')).toBe(false)
    expect(compiled.test('bad!name')).toBe(false)
  })

  it('submits valid login credentials to the backend', async () => {
    const fetchMock = mockAuthApi()
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <AuthPage initialMode="login" />
        </MemoryRouter>
      </AuthProvider>
    )

    const usernameInput = await screen.findByPlaceholderText(/Username/i)
    const passwordInput = screen.getByPlaceholderText(/Password/i)
    const submitBtn = screen.getByRole('button', { name: /^Sign In$/i })

    fireEvent.change(usernameInput, { target: { value: 'ValidPlayer-1' } })
    fireEvent.change(passwordInput, { target: { value: 'ValidPassword123!' } })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const loginCalls = fetchMock.mock.calls.filter((call: any[]) => String(call[0]).includes('/api/auth/login'))
      expect(loginCalls.length).toBe(1)
      const sentPayload = JSON.parse(loginCalls[0][1].body)
      expect(sentPayload.username).toBe('ValidPlayer-1')
      expect(sentPayload.password).toBe('ValidPassword123!')
    })
  })
})
