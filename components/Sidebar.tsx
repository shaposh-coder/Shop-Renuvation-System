'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDollarSign,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  Settings,
  X,
} from 'lucide-react'

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Cash Records', path: '/cash-records', icon: CircleDollarSign },
  { name: 'Expenses', path: '/expenses', icon: Receipt },
  {
    name: 'Settings',
    path: '/settings',
    icon: Settings,
    subItems: [
      { name: 'Categories', path: '/settings/categories' },
      { name: 'Location', path: '/settings/location' },
      { name: 'Users', path: '/settings/users' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [hoveredMenuPath, setHoveredMenuPath] = useState<string | null>(null)
  const [expandedMenuPath, setExpandedMenuPath] = useState<string>('/settings')
  const [isAdminUser, setIsAdminUser] = useState(false)

  const isActivePath = (path: string) =>
    pathname === path || pathname.startsWith(path + '/')

  const closeMobileMenu = () => setIsMobileOpen(false)
  const toggleSubmenu = (path: string) => {
    setExpandedMenuPath((prev) => (prev === path ? '' : path))
  }
  const handleSignOut = () => {
    document.cookie = 'rms_session=; path=/; max-age=0; samesite=lax'
    document.cookie = 'rms_user_email=; path=/; max-age=0; samesite=lax'
    document.cookie = 'rms_user_role=; path=/; max-age=0; samesite=lax'
    localStorage.removeItem('rms_session')
    localStorage.removeItem('rms_user_email')
    localStorage.removeItem('rms_user_role')
    closeMobileMenu()
    router.replace('/login')
  }
  const handleBrandClick = () => {
    closeMobileMenu()
    if (pathname.startsWith('/dashboard')) {
      router.refresh()
      return
    }
    router.push('/dashboard')
  }

  const visibleMenuItems = useMemo(
    () =>
      menuItems.map((item) => {
        if (item.path !== '/settings' || !item.subItems) return item
        return {
          ...item,
          subItems: item.subItems.filter((subItem) =>
            subItem.path === '/settings/users' ? isAdminUser : true
          ),
        }
      }),
    [isAdminUser]
  )

  useEffect(() => {
    const roleCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_role='))
    const roleValue = roleCookie
      ? decodeURIComponent(roleCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_role') ?? '')
    setIsAdminUser(roleValue === 'Admin')
  }, [])

  useEffect(() => {
    const matchedParent = visibleMenuItems.find((item) => {
      if (!item.subItems?.length) return false
      return pathname === item.path || pathname.startsWith(item.path + '/')
    })
    setExpandedMenuPath(matchedParent?.path ?? '')
  }, [pathname, visibleMenuItems])

  const renderSidebarContent = (isDesktop = false) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className={`flex items-center ${
          isDesktop && isDesktopCollapsed
            ? 'justify-center px-2 py-2'
            : 'justify-between px-6 py-4'
        }`}
      >
        <button
          type="button"
          onClick={handleBrandClick}
          className={`font-bold text-primary-600 ${
            isDesktop && isDesktopCollapsed
              ? 'text-[11px] tracking-wide'
              : isDesktop
                ? 'text-2xl'
                : 'text-lg'
          }`}
          aria-label="Go to dashboard"
        >
          RMS
        </button>
        {isDesktop && !isDesktopCollapsed && (
          <button
            type="button"
            onClick={() => setIsDesktopCollapsed(true)}
            className="rounded-md p-2 text-gray-700 hover:bg-gray-100"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      <nav className="relative mt-4 flex-1 md:mt-6">
        {visibleMenuItems.map((item) => {
          const Icon = item.icon
          const isActive = isActivePath(item.path)
          const hasSubItems = Boolean(item.subItems?.length)
          const isSubmenuExpanded = expandedMenuPath === item.path

          return (
            <div
              key={item.path}
              className="relative"
              onMouseEnter={() => {
                if (isDesktop && isDesktopCollapsed && item.subItems?.length) {
                  setHoveredMenuPath(item.path)
                }
              }}
              onMouseLeave={() => {
                if (isDesktop && isDesktopCollapsed) {
                  setHoveredMenuPath((current) => (current === item.path ? null : current))
                }
              }}
            >
              <div
                className={`flex items-center py-3 text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-colors ${
                  isDesktop && isDesktopCollapsed ? 'justify-center px-3' : 'px-6'
                } ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 border-r-4 border-primary-600'
                    : ''
                }`}
              >
                <Link
                  href={item.path}
                  onClick={() => {
                    closeMobileMenu()
                    setExpandedMenuPath(hasSubItems ? item.path : '')
                  }}
                  className="flex min-w-0 flex-1 items-center"
                >
                  <Icon className={isDesktop && isDesktopCollapsed ? 'h-5 w-5' : 'h-5 w-5 mr-3'} />
                  {(!isDesktop || !isDesktopCollapsed) && (
                    <span className="font-medium">{item.name}</span>
                  )}
                </Link>
                {hasSubItems && !isDesktopCollapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleSubmenu(item.path)}
                    className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    aria-label={`${isSubmenuExpanded ? 'Hide' : 'Show'} ${item.name} submenu`}
                  >
                    {isSubmenuExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                ) : null}
              </div>

              {!isDesktopCollapsed && hasSubItems && isSubmenuExpanded ? (
                <div className="bg-gray-50 py-1">
                  {item.subItems?.map((subItem) => {
                    const isSubActive = isActivePath(subItem.path)
                    return (
                      <Link
                        key={subItem.path}
                        href={subItem.path}
                        onClick={closeMobileMenu}
                        className={`block py-2 pl-14 pr-6 text-sm text-gray-600 hover:bg-primary-50 hover:text-primary-600 ${
                          isSubActive ? 'text-primary-600 font-medium' : ''
                        }`}
                      >
                        {subItem.name}
                      </Link>
                    )
                  })}
                </div>
              ) : null}

              {isDesktop && isDesktopCollapsed && item.subItems?.length && hoveredMenuPath === item.path ? (
                <div className="absolute left-full top-0 z-50 ml-2 min-w-[170px] whitespace-nowrap rounded-md border bg-white py-2 shadow-lg">
                  {item.subItems?.map((subItem) => {
                    const isSubActive = isActivePath(subItem.path)
                    return (
                      <Link
                        key={subItem.path}
                        href={subItem.path}
                        className={`block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600 ${
                          isSubActive ? 'text-primary-600 font-medium' : ''
                        }`}
                      >
                        {subItem.name}
                      </Link>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </nav>

      <div className="mt-auto border-t p-3">
        <button
          type="button"
          onClick={handleSignOut}
          className={`w-full rounded-md border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 ${
            isDesktop && isDesktopCollapsed ? 'px-2' : ''
          }`}
          aria-label="Sign out"
        >
          {isDesktop && isDesktopCollapsed ? (
            <span className="flex items-center justify-center">
              <LogOut className="h-4 w-4" />
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <LogOut className="h-4 w-4" />
              <span>Sign out</span>
            </span>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <div className="sticky top-0 z-30 flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <h1 className="text-lg font-bold text-primary-600">RMS</h1>
        <button
          type="button"
          onClick={() => setIsMobileOpen((prev) => !prev)}
          className="rounded-md p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Toggle menu"
        >
          {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {isMobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={closeMobileMenu}
          aria-label="Close menu overlay"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-200 md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={closeMobileMenu}
          className="absolute right-2 top-2 rounded-md p-2 text-gray-700 hover:bg-gray-100"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
        {renderSidebarContent()}
      </aside>

      <aside
        className={`hidden bg-white shadow-lg transition-all duration-200 md:block ${
          isDesktopCollapsed ? 'w-20' : 'w-64'
        } md:flex md:h-screen md:flex-col md:overflow-visible`}
      >
        {isDesktopCollapsed ? (
          <div className="flex justify-center px-2 pt-2">
            <button
              type="button"
              onClick={() => setIsDesktopCollapsed(false)}
              className="rounded-md p-2 text-gray-700 hover:bg-gray-100"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        {renderSidebarContent(true)}
      </aside>
    </>
  )
}

