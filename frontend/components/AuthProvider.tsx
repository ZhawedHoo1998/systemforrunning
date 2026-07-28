"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { LoaderCircle } from "lucide-react"
import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
  type User,
} from "@/lib/api"


interface AuthContextValue {
  user: User | null
  loading: boolean
  signIn: (username: string, password: string) => Promise<User>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      setUser(await getCurrentUser())
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const handleUnauthorized = () => {
      setUser(null)
      setLoading(false)
    }
    window.addEventListener("ruby-rain:unauthorized", handleUnauthorized)
    getCurrentUser()
      .then((authenticatedUser) => {
        if (active) setUser(authenticatedUser)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
      window.removeEventListener("ruby-rain:unauthorized", handleUnauthorized)
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user && pathname !== "/login") {
      const next = `${pathname}${window.location.search}`
      router.replace(`/login?next=${encodeURIComponent(next)}`)
    }
  }, [loading, pathname, router, user])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    loading,
    signIn: async (username, password) => {
      const authenticatedUser = await loginRequest(username, password)
      setUser(authenticatedUser)
      setLoading(false)
      return authenticatedUser
    },
    signOut: async () => {
      try {
        await logoutRequest()
      } finally {
        setUser(null)
        setLoading(false)
        router.replace("/login")
      }
    },
    refreshUser,
  }), [loading, refreshUser, router, user])

  if (pathname !== "/login" && (loading || !user)) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          正在验证登录状态
        </div>
      </div>
    )
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
