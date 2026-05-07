'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'

interface AppShellProps {
  children: ReactNode
}

const SESSION_COOKIE = 'rms_session=1'
const ROLE_COOKIE_PREFIX = 'rms_user_role='
const EMAIL_COOKIE_PREFIX = 'rms_user_email='

const getCookieValue = (cookieName: string) => {
  const cookieEntry = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${cookieName}=`))
  return cookieEntry ? decodeURIComponent(cookieEntry.split('=')[1] ?? '') : ''
}

export default function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null)

  useEffect(() => {
    const sessionFromCookie = getCookieValue('rms_session')
    const emailFromCookie = getCookieValue('rms_user_email')
    const roleFromCookie = getCookieValue('rms_user_role')

    const sessionFromStorage = localStorage.getItem('rms_session') ?? ''
    const emailFromStorage = localStorage.getItem('rms_user_email') ?? ''
    const roleFromStorage = localStorage.getItem('rms_user_role') ?? ''

    const hasSession =
      sessionFromCookie === '1' ||
      sessionFromStorage === '1' ||
      Boolean((emailFromCookie || emailFromStorage).trim())
    const userEmail = (emailFromCookie || emailFromStorage).trim()
    const userRole = (roleFromCookie || roleFromStorage).trim()

    // If cookies are missing but localStorage has session, restore cookies to avoid false logout on reload.
    if (sessionFromCookie !== '1' && sessionFromStorage === '1') {
      document.cookie = `rms_session=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    }
    if (!emailFromCookie && emailFromStorage) {
      document.cookie = `rms_user_email=${encodeURIComponent(emailFromStorage)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    }
    if (!roleFromCookie && roleFromStorage) {
      document.cookie = `rms_user_role=${encodeURIComponent(roleFromStorage)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    }

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
      return
    }

    // Session edge-case guard: if session exists but email vanished, recover from storage.
    if (hasSession && !userEmail && pathname !== '/login') {
      const fallbackEmail = localStorage.getItem('rms_user_email') ?? ''
      if (fallbackEmail) {
        document.cookie = `rms_user_email=${encodeURIComponent(fallbackEmail)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
      }
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
