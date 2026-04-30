'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Menu,
  Settings,
  X,
} from 'lucide-react'

const menuItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  {
    name: 'Settings',
    path: '/settings',
    icon: Settings,
    subItems: [
      { name: 'Categories', path: '/settings/categories' },
      { name: 'Location', path: '/settings/location' },
    ],
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [isMobileOpen, setIsMobileOpen] = useState(false)
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false)
  const [hoveredMenuPath, setHoveredMenuPath] = useState<string | null>(null)

  const isActivePath = (path: string) =>
    pathname === path || pathname.startsWith(path + '/')

  const closeMobileMenu = () => setIsMobileOpen(false)

  const renderSidebarContent = (isDesktop = false) => (
    <>
      <div
        className={`flex items-center ${
          isDesktop && isDesktopCollapsed
            ? 'justify-center px-2 py-2'
            : 'justify-between px-6 py-4'
        }`}
      >
        <h1
          className={`font-bold text-primary-600 ${
            isDesktop && isDesktopCollapsed
              ? 'text-[11px] tracking-wide'
              : isDesktop
                ? 'text-2xl'
                : 'text-lg'
          }`}
        >
          RMS
        </h1>
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

      <nav className="mt-4 md:mt-6">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = isActivePath(item.path)

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
              <Link
                href={item.path}
                onClick={closeMobileMenu}
                className={`flex items-center py-3 text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-colors ${
                  isDesktop && isDesktopCollapsed ? 'justify-center px-3' : 'px-6'
                } ${
                  isActive
                    ? 'bg-primary-50 text-primary-600 border-r-4 border-primary-600'
                    : ''
                }`}
              >
                <Icon className={isDesktop && isDesktopCollapsed ? 'h-5 w-5' : 'h-5 w-5 mr-3'} />
                {(!isDesktop || !isDesktopCollapsed) && (
                  <span className="font-medium">{item.name}</span>
                )}
              </Link>

              {!isDesktopCollapsed && item.subItems?.length ? (
                <div className="bg-gray-50 py-1">
                  {item.subItems.map((subItem) => {
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
                <div className="absolute left-full top-0 z-50 ml-2 min-w-[170px] rounded-md border bg-white py-2 shadow-lg">
                  {item.subItems.map((subItem) => {
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
    </>
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
        }`}
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

