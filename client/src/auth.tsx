import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

// Same address as the page (empty by default): the API lives next to the website, so no host name is hard-coded.
const API_URL = import.meta.env.VITE_API_URL ?? ''
const EXPIRED_EVENT = 'auth:expired'

export type AuthUser = {
  id: string
  email: string
  role: 'admin' | 'employee'
  employeeId: string | null
  employeeName: string | null
}

// The login session is an HttpOnly cookie set by the server: the browser sends it automatically and page scripts can
// never read it. All this does is send a 401 (logged out or session expired) back to the login screen.
export function installAuthFetch() {
  const originalFetch = window.fetch.bind(window)
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const response = await originalFetch(input, init)
    if (response.status === 401 && url.includes('/api/') && !url.endsWith('/api/auth/login') && !url.endsWith('/api/auth/me')) {
      window.dispatchEvent(new Event(EXPIRED_EVENT))
    }
    return response
  }
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Am I already logged in (a valid session cookie)?
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener(EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(EXPIRED_EVENT, onExpired)
  }, [])

  // Returns an error message, or null on success
  const login = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        return data?.error || 'Login failed'
      }
      setUser(data.user)
      return null
    } catch {
      return 'Could not reach the server'
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch(`${API_URL}/api/auth/logout`, { method: 'POST' }).catch(() => undefined)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
