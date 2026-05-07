'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

type SummaryBucket = { approved: number; pending: number; total: number }

interface DashboardSummaryRpcResponse {
  cash: SummaryBucket
  expenses: SummaryBucket
  net_cash_in_hand: number
}

interface CashInHandRpcResponse {
  approved_cash: number
  approved_expenses: number
  cash_in_hand: number
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryRpcResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fixedNetCashInHand, setFixedNetCashInHand] = useState(0)
  const [isFixedNetLoading, setIsFixedNetLoading] = useState(true)
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null)
  const [userOptions, setUserOptions] = useState<string[]>([])
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterUserName, setFilterUserName] = useState('')
  const [userFilterSearch, setUserFilterSearch] = useState('')
  const [isUserFilterDropdownOpen, setIsUserFilterDropdownOpen] = useState(false)
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)

  const formatCurrency = (value: number) => `Rs. ${Number(value || 0).toLocaleString('en-PK')}`
  const filteredUserOptions =
    userFilterSearch.trim().length === 0
      ? userOptions
      : userOptions.filter((name) => name.toLowerCase().includes(userFilterSearch.trim().toLowerCase()))

  const currentMonthDefaults = useMemo(() => {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    const toInput = (d: Date) => {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    return { from: toInput(firstDay), to: toInput(lastDay) }
  }, [])

  useEffect(() => {
    setFilterDateFrom(currentMonthDefaults.from)
    setFilterDateTo(currentMonthDefaults.to)
  }, [currentMonthDefaults.from, currentMonthDefaults.to])

  useEffect(() => {
    const roleCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_role='))

    const roleValue = roleCookie
      ? decodeURIComponent(roleCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_role') ?? '')

    const role = roleValue || null
    setCurrentUserRole(role)

    const loadUsersIfAdmin = async () => {
      if (role !== 'Admin') {
        setUserOptions([])
        return
      }
      const { data, error } = await supabase
        .from('users')
        .select('user_name')
        .order('user_name', { ascending: true })
      if (error) {
        setUserOptions([])
        return
      }
      const names = Array.from(
        new Set(
          ((data as { user_name: string }[]) ?? [])
            .map((row) => row.user_name?.trim() ?? '')
            .filter((name) => name.length > 0)
        )
      )
      setUserOptions(names)
    }

    loadUsersIfAdmin()
  }, [])

  const fetchSummary = async (currentEmail: string) => {
    setIsLoading(true)
    setErrorMessage(null)

    const { data, error } = await supabase.rpc('get_dashboard_summary_v3', {
      p_user_email: currentEmail,
      p_filter_user_name: filterUserName,
      p_filter_date_from: filterDateFrom || null,
      p_filter_date_to: filterDateTo || null,
    })

    if (error) {
      setErrorMessage(error.message)
      setSummary(null)
      setIsLoading(false)
      return
    }

    setSummary((data ?? null) as DashboardSummaryRpcResponse | null)
    setIsLoading(false)
  }

  useEffect(() => {
    const emailCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_email='))

    const currentEmail = emailCookie
      ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_email') ?? '')

    if (!currentEmail) {
      setSummary(null)
      setIsLoading(false)
      return
    }

    fetchSummary(currentEmail)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterUserName, filterDateFrom, filterDateTo])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isFilterOpen) return
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
        setIsUserFilterDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFilterOpen])

  useEffect(() => {
    const fetchFixedNetCash = async () => {
      setIsFixedNetLoading(true)

      const emailCookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('rms_user_email='))

      const currentEmail = emailCookie
        ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
        : (localStorage.getItem('rms_user_email') ?? '')

      if (!currentEmail) {
        setFixedNetCashInHand(0)
        setIsFixedNetLoading(false)
        return
      }

      // Independent summary: only approved cash - approved expenses, no date/user filter impact.
      const { data, error } = await supabase.rpc('get_cash_in_hand_value', {
        p_user_email: currentEmail,
      })

      if (error) {
        setFixedNetCashInHand(0)
        setIsFixedNetLoading(false)
        return
      }

      const payload = (data ?? null) as CashInHandRpcResponse | null
      setFixedNetCashInHand(payload?.cash_in_hand ?? 0)
      setIsFixedNetLoading(false)
    }

    fetchFixedNetCash()
  }, [])

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

        <div ref={filterPopoverRef} className="relative">
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filter</span>
          </button>

          {isFilterOpen ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-80 rounded-md border-2 border-gray-400 bg-white p-3 shadow-lg">
              <div className="space-y-3">
                {currentUserRole === 'Admin' ? (
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                      User Name
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setIsUserFilterDropdownOpen((prev) => !prev)
                          setUserFilterSearch('')
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <span className="truncate text-left">{filterUserName || 'All Users'}</span>
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </button>

                      {isUserFilterDropdownOpen ? (
                        <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-md border border-gray-300 bg-white p-2 shadow-lg">
                          <input
                            type="text"
                            value={userFilterSearch}
                            onChange={(event) => setUserFilterSearch(event.target.value)}
                            placeholder="Search user..."
                            className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setFilterUserName('')
                              setIsUserFilterDropdownOpen(false)
                              setUserFilterSearch('')
                            }}
                            className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                              !filterUserName
                                ? 'bg-blue-50 font-medium text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            All Users
                          </button>
                          {filteredUserOptions.length === 0 ? (
                            <p className="px-2 py-2 text-sm text-gray-500">No user found.</p>
                          ) : (
                            filteredUserOptions.map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  setFilterUserName(name)
                                  setIsUserFilterDropdownOpen(false)
                                  setUserFilterSearch('')
                                }}
                                className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                                  filterUserName === name
                                    ? 'bg-blue-50 font-medium text-blue-700'
                                    : 'text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                {name}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Date Range
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(event) => setFilterDateFrom(event.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(event) => setFilterDateTo(event.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterUserName('')
                      setUserFilterSearch('')
                      setIsUserFilterDropdownOpen(false)
                      setFilterDateFrom('')
                      setFilterDateTo('')
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    All Records
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFilterUserName('')
                      setUserFilterSearch('')
                      setIsUserFilterDropdownOpen(false)
                      setFilterDateFrom(currentMonthDefaults.from)
                      setFilterDateTo(currentMonthDefaults.to)
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFilterOpen(false)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cash in Hand</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isFixedNetLoading ? 'Loading...' : formatCurrency(fixedNetCashInHand)}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Calculation: Approved Cash Records - Approved Expense Records (all-time).
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expenses</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isLoading ? 'Loading...' : formatCurrency(summary?.expenses.approved ?? 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Expenses Details</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Approved Expenses</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(summary?.expenses.approved ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Pending Expenses</span>
              <span className="font-semibold text-gray-900">
                {formatCurrency(summary?.expenses.pending ?? 0)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-gray-700">Total Expenses</span>
              <span className="font-bold text-gray-900">{formatCurrency(summary?.expenses.total ?? 0)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">All Cash Details</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isLoading ? 'Loading...' : formatCurrency(summary?.cash.approved ?? 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Cash Records Details</p>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Approved Cash</span>
              <span className="font-semibold text-gray-900">{formatCurrency(summary?.cash.approved ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Pending Cash</span>
              <span className="font-semibold text-gray-900">{formatCurrency(summary?.cash.pending ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <span className="text-gray-700">Total Cash</span>
              <span className="font-bold text-gray-900">{formatCurrency(summary?.cash.total ?? 0)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
