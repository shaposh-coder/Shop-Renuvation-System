'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

interface AppShellProps {
  children: ReactNode
}

const SESSION_COOKIE = 'rms_session=1'
const ROLE_COOKIE_PREFIX = 'rms_user_role='

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const hasSessionCookie = document.cookie.includes(SESSION_COOKIE)
    const hasSessionStorage = localStorage.getItem('rms_session') === '1'
    const hasSession = hasSessionCookie || hasSessionStorage
    const roleCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(ROLE_COOKIE_PREFIX))
    const roleFromCookie = roleCookie ? decodeURIComponent(roleCookie.split('=')[1] ?? '') : ''
    const userRole = roleFromCookie || localStorage.getItem('rms_user_role') || ''
    setIsAuthenticated(hasSession)

    if (!hasSession && pathname !== '/login') {
      router.replace('/login')
      return
    }

    if (hasSession && pathname === '/login') {
      router.replace('/dashboard')
      return
    }

    if (hasSession && pathname.startsWith('/settings/users') && userRole !== 'Admin') {
      router.replace('/dashboard')
    }
  }, [pathname, router])

  if (isAuthenticated === null) {
    return <div className="min-h-screen bg-gray-50" />
  }

  if (!isAuthenticated && pathname !== '/login') {
    return <div className="min-h-screen bg-gray-50" />
  }

  if (pathname === '/login') {
    return <>{children}</>
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50 md:h-screen md:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
