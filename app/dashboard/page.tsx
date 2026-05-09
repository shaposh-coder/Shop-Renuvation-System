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
  pending_expenses: number
  cash_in_hand: number
}

interface CashInHandUserRow {
  user_name: string
  cash_value: number
  pending_expenses: number
  net_cash_in_hand: number
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummaryRpcResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [fixedNetCashInHand, setFixedNetCashInHand] = useState(0)
  const [fixedPendingExpenses, setFixedPendingExpenses] = useState(0)
  const [isFixedNetLoading, setIsFixedNetLoading] = useState(true)
  const [cashByUserRows, setCashByUserRows] = useState<CashInHandUserRow[]>([])
  const [isCashByUserLoading, setIsCashByUserLoading] = useState(true)
  const [cashByUserError, setCashByUserError] = useState<string | null>(null)
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
        setFixedPendingExpenses(0)
        setIsFixedNetLoading(false)
        return
      }

      // Independent summary: only approved cash - approved expenses, no date/user filter impact.
      const { data, error } = await supabase.rpc('get_cash_in_hand_value', {
        p_user_email: currentEmail,
      })

      if (error) {
        setFixedNetCashInHand(0)
        setFixedPendingExpenses(0)
        setIsFixedNetLoading(false)
        return
      }

      const payload = (data ?? null) as CashInHandRpcResponse | null
      setFixedNetCashInHand(payload?.cash_in_hand ?? 0)
      setFixedPendingExpenses(payload?.pending_expenses ?? 0)
      setIsFixedNetLoading(false)
    }

    fetchFixedNetCash()
  }, [])

  useEffect(() => {
    const fetchCashByUser = async () => {
      setIsCashByUserLoading(true)
      setCashByUserError(null)

      const emailCookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('rms_user_email='))

      const currentEmail = emailCookie
        ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
        : (localStorage.getItem('rms_user_email') ?? '')

      if (!currentEmail) {
        setCashByUserRows([])
        setIsCashByUserLoading(false)
        return
      }

      const { data, error } = await supabase.rpc('get_cash_in_hand_by_user_rows', {
        p_viewer_email: currentEmail,
      })

      if (error) {
        setCashByUserError(error.message)
        setCashByUserRows([])
        setIsCashByUserLoading(false)
        return
      }

      const raw = (data ?? []) as unknown[]
      const rows: CashInHandUserRow[] = raw.map((item) => {
        const r = item as Record<string, unknown>
        return {
          user_name: String(r.user_name ?? ''),
          cash_value: Number(r.cash_value ?? 0),
          pending_expenses: Number(r.pending_expenses ?? 0),
          net_cash_in_hand: Number(r.net_cash_in_hand ?? 0),
        }
      })
      setCashByUserRows(rows)
      setIsCashByUserLoading(false)
    }

    fetchCashByUser()
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

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
        <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Cash in Hand</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isFixedNetLoading ? 'Loading...' : formatCurrency(fixedNetCashInHand - fixedPendingExpenses)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Cash in Hand Details</p>
          <div className="mt-4 flex-1 space-y-2 border-t pt-3 text-sm">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Cash Value</span>
              <span className="font-semibold text-gray-900">
                {isFixedNetLoading ? 'Loading...' : formatCurrency(fixedNetCashInHand)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Pending Expenses</span>
              <span className="font-semibold text-gray-900">
                {isFixedNetLoading ? 'Loading...' : formatCurrency(fixedPendingExpenses)}
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2 text-sm">
              <span className="text-gray-700">Net Cash in Hand</span>
              <span className="font-bold text-gray-900">
                {isFixedNetLoading
                  ? 'Loading...'
                  : formatCurrency(fixedNetCashInHand - fixedPendingExpenses)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Expenses</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isLoading ? 'Loading...' : formatCurrency(summary?.expenses.approved ?? 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Expenses Details</p>
          <div className="mt-4 flex-1 space-y-2 border-t pt-3 text-sm">
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

        <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">All Cash Details</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {isLoading ? 'Loading...' : formatCurrency(summary?.cash.approved ?? 0)}
          </p>
          <p className="mt-1 text-xs text-gray-500">Cash Records Details</p>
          <div className="mt-4 flex-1 space-y-2 border-t pt-3 text-sm">
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

      <div className="my-8 border-t border-gray-200" role="separator" />

      <div className="min-w-0 overflow-x-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-3 py-4 sm:px-4 md:px-6">
          <h2 className="text-base font-semibold text-gray-900 sm:text-lg">Cash in hand by user</h2>
          <p className="mt-1 text-xs leading-relaxed text-gray-500 sm:text-sm">
            Same figures as the Cash in Hand of All Users.
          </p>
        </div>

        {cashByUserError ? (
          <div className="px-3 py-3 text-sm text-red-700 sm:px-4 md:px-6">
            {cashByUserError}
            <span className="mt-1 block text-xs text-gray-600">
              If this is a new install, run the SQL migration that defines{' '}
              <code className="rounded bg-gray-100 px-1">get_cash_in_hand_by_user_rows</code> in Supabase.
            </span>
          </div>
        ) : null}

        {/* Mobile: one card per user — no horizontal table scroll */}
        <div className="md:hidden">
          {isCashByUserLoading ? (
            <div className="px-3 py-10 text-center text-sm text-gray-500 sm:px-4">Loading…</div>
          ) : cashByUserRows.length === 0 ? (
            <div className="px-3 py-10 text-center text-sm text-gray-500 sm:px-4">No users in this list.</div>
          ) : (
            <ul className="space-y-3 px-3 pb-4 pt-1 sm:px-4">
              {cashByUserRows.map((row) => (
                <li
                  key={row.user_name}
                  className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm ring-1 ring-gray-100"
                >
                  <p className="text-sm font-semibold leading-snug text-gray-900 break-words">{row.user_name}</p>
                  <dl className="mt-3 space-y-2.5 border-t border-gray-100 pt-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-gray-600">Cash value</dt>
                      <dd className="min-w-0 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(row.cash_value)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="shrink-0 text-gray-600">Pending expenses</dt>
                      <dd className="min-w-0 text-right font-medium tabular-nums text-gray-900">
                        {formatCurrency(row.pending_expenses)}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-3 border-t border-gray-100 pt-2.5">
                      <dt className="shrink-0 font-medium text-gray-800">Net cash in hand</dt>
                      <dd className="min-w-0 text-right text-base font-bold tabular-nums text-gray-900">
                        {formatCurrency(row.net_cash_in_hand)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* md+: table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 md:px-6">
                  User name
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-700 md:px-6">
                  Cash value
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-700 md:px-6">
                  Pending expenses
                </th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-700 md:px-6">
                  Net cash in hand
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {isCashByUserLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 md:px-6">
                    Loading…
                  </td>
                </tr>
              ) : cashByUserRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 md:px-6">
                    No users in this list.
                  </td>
                </tr>
              ) : (
                cashByUserRows.map((row) => (
                  <tr key={row.user_name} className="hover:bg-gray-50/80">
                    <td className="max-w-[12rem] truncate px-4 py-3 font-medium text-gray-900 md:max-w-none md:px-6">
                      {row.user_name}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-900 md:px-6">
                      {formatCurrency(row.cash_value)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-gray-900 md:px-6">
                      {formatCurrency(row.pending_expenses)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-gray-900 md:px-6">
                      {formatCurrency(row.net_cash_in_hand)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
