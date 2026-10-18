import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { authenticate as apiAuthenticate, getCurrentUser, logout as apiLogout } from '../api/client'
import type { AuthenticatedProfile } from '../api/types'

interface AuthContextValue {
  user: AuthenticatedProfile | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<AuthenticatedProfile>
  register: (username: string, password: string) => Promise<AuthenticatedProfile>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
  clearError: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthenticatedProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refreshUser = async () => {
    try {
      const current = await getCurrentUser()
      setUser(current)
      setError(null)
    } catch (err) {
      // 401 returns null in getCurrentUser without throwing; network errors or API errors end up here
      setError(err instanceof Error ? err.message : 'Unable to verify session')
      // Do not clear an already authenticated user on a transient network failure or API error
      setUser(prev => (prev ? prev : null))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshUser()
  }, [])

  const login = async (username: string, password: string): Promise<AuthenticatedProfile> => {
    setError(null)
    try {
      const profile = await apiAuthenticate('login', username, password)
      setUser(profile)
      return profile
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      setError(msg)
      throw err
    }
  }

  const register = async (username: string, password: string): Promise<AuthenticatedProfile> => {
    setError(null)
    try {
      const profile = await apiAuthenticate('register', username, password)
      setUser(profile)
      return profile
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed'
      setError(msg)
      throw err
    }
  }

  const logout = async (): Promise<void> => {
    try {
      await apiLogout()
    } finally {
      setUser(null)
      setError(null)
    }
  }

  const clearError = () => setError(null)

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        logout,
        refreshUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
