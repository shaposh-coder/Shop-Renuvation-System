'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown, MoreVertical, SlidersHorizontal } from 'lucide-react'

type ExpenseStatus = 'Pending' | 'Approved'
type UserRole = 'Admin' | 'Managment' | 'Viewer'

interface LocationOption {
  id: number
  shop_name: string
}

interface CategoryOption {
  id: number
  name: string
}

interface ExpenseLocationRelation {
  id: number
  shop_name: string
}

interface ExpenseCategoryRelation {
  id: number
  name: string
}

interface ExpenseRecord {
  id: number
  user_name: string
  entry_date: string
  narration: string
  expense_value: number
  location_id: number
  category_id: number
  status: ExpenseStatus
  locations: ExpenseLocationRelation | ExpenseLocationRelation[] | null
  categories: ExpenseCategoryRelation | ExpenseCategoryRelation[] | null
}

interface UserLocationRow {
  location_id: number
}

interface UserOption {
  user_name: string
}

interface CurrentUserContext {
  id: number
  role: UserRole
  user_name: string
}

interface ActionMenuState {
  recordId: number
  top: number
  left: number
  openUp: boolean
}

interface ExpensesRpcResponse {
  total_count: number
  records: ExpenseRecord[]
}

interface CashInHandRpcResponse {
  approved_cash: number
  approved_expenses: number
  pending_expenses: number
  cash_in_hand: number
}

let expensesPageCache: {
  hydrated: boolean
  currentUserName: string
  currentUserRole: UserRole | null
  userOptions: string[]
  locations: LocationOption[]
  categories: CategoryOption[]
  records: ExpenseRecord[]
  totalCount: number
  currentPage: number
  currentUserContext: CurrentUserContext | null
  currentUserEmail: string
} = {
  hydrated: false,
  currentUserName: '',
  currentUserRole: null,
  userOptions: [],
  locations: [],
  categories: [],
  records: [],
  totalCount: 0,
  currentPage: 1,
  currentUserContext: null,
  currentUserEmail: '',
}

export default function ExpensesPage() {
  const getTodayDateInputValue = () => new Date().toISOString().split('T')[0] ?? ''
  const ITEMS_PER_PAGE = 25
  const [userName, setUserName] = useState('')
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue())
  const [narration, setNarration] = useState('')
  const [expenseValue, setExpenseValue] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [filterUserName, setFilterUserName] = useState('')
  const [isFilterUserDropdownOpen, setIsFilterUserDropdownOpen] = useState(false)
  const [filterUserSearchTerm, setFilterUserSearchTerm] = useState('')
  const [filterLocationId, setFilterLocationId] = useState<number | ''>('')
  const [filterLocationInput, setFilterLocationInput] = useState('')
  const [isFilterLocationDropdownOpen, setIsFilterLocationDropdownOpen] = useState(false)
  const [filterLocationSearchTerm, setFilterLocationSearchTerm] = useState('')
  const [filterCategoryId, setFilterCategoryId] = useState<number | ''>('')
  const [filterCategoryInput, setFilterCategoryInput] = useState('')
  const [isFilterCategoryDropdownOpen, setIsFilterCategoryDropdownOpen] = useState(false)
  const [filterCategorySearchTerm, setFilterCategorySearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | ''>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [locationSearchTerm, setLocationSearchTerm] = useState('')
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false)
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [categorySearchTerm, setCategorySearchTerm] = useState('')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [userOptions, setUserOptions] = useState<string[]>([])
  const [records, setRecords] = useState<ExpenseRecord[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null)
  const [approveRecordId, setApproveRecordId] = useState<number | null>(null)
  const [viewRecordId, setViewRecordId] = useState<number | null>(null)
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null)
  const [mobileActionMenuId, setMobileActionMenuId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecordsLoading, setIsRecordsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [currentUserContext, setCurrentUserContext] = useState<CurrentUserContext | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const hasFetchedOnceRef = useRef(false)
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)
  const locationDropdownRef = useRef<HTMLDivElement | null>(null)
  const categoryDropdownRef = useRef<HTMLDivElement | null>(null)

  const getCurrentUserEmail = () => {
    const emailCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_email='))

    return emailCookie
      ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_email') ?? '')
  }

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('categories')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      setCategories([])
      return
    }

    setCategories((data as CategoryOption[]) ?? [])
  }

  const fetchAllowedLocations = async (): Promise<CurrentUserContext | null> => {
    const currentEmail = getCurrentUserEmail()
    if (!currentEmail) {
      setLocations([])
      setCurrentUserRole(null)
      setCurrentUserName('')
      return null
    }
    setCurrentUserEmail(currentEmail)

    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, role, user_name')
      .eq('user_email', currentEmail)
      .single<{ id: number; role: UserRole; user_name: string }>()

    if (currentUserError || !currentUser) {
      setErrorMessage(currentUserError?.message ?? 'User not found.')
      setLocations([])
      setUserOptions([])
      setCurrentUserRole(null)
      setCurrentUserName('')
      return null
    }

    setCurrentUserRole(currentUser.role)
    setCurrentUserName(currentUser.user_name)

    if (currentUser.role === 'Admin') {
      const { data, error } = await supabase
        .from('locations')
        .select('id, shop_name')
        .order('shop_name', { ascending: true })

      if (error) {
        setErrorMessage(error.message)
        setLocations([])
        return currentUser
      }

      setLocations((data as LocationOption[]) ?? [])

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('user_name')
        .order('user_name', { ascending: true })

      if (usersError) {
        setErrorMessage(usersError.message)
        setUserOptions([])
        return currentUser
      }

      const uniqueNames = Array.from(
        new Set(
          ((usersData as UserOption[]) ?? [])
            .map((user) => user.user_name.trim())
            .filter((name) => name.length > 0)
        )
      )
      setUserOptions(uniqueNames)
      return currentUser
    }

    setUserOptions([])
    setUserName(currentUser.user_name)

    const { data: mappingRows, error: mappingError } = await supabase
      .from('user_locations')
      .select('location_id')
      .eq('user_id', currentUser.id)

    if (mappingError) {
      setErrorMessage(mappingError.message)
      setLocations([])
      return currentUser
    }

    const assignedLocationIds = ((mappingRows as UserLocationRow[]) ?? []).map((row) => row.location_id)

    if (assignedLocationIds.length === 0) {
      setLocations([])
      return currentUser
    }

    const { data, error } = await supabase
      .from('locations')
      .select('id, shop_name')
      .in('id', assignedLocationIds)
      .order('shop_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      setLocations([])
      return currentUser
    }

    setLocations((data as LocationOption[]) ?? [])
    return currentUser
  }

  const fetchExpenses = async (
    page = 1,
    searchValue = '',
    selectedUserName = '',
    selectedLocationId: number | '' = '',
    selectedCategoryId: number | '' = '',
    selectedStatus: ExpenseStatus | '' = '',
    selectedDateFrom = '',
    selectedDateTo = ''
  ) => {
    if (!currentUserEmail) {
      setRecords([])
      setTotalCount(0)
      return
    }

    const { data, error } = await supabase.rpc('get_expenses_page_data', {
      p_user_email: currentUserEmail,
      p_page: page,
      p_page_size: ITEMS_PER_PAGE,
      p_search: searchValue.trim(),
      p_filter_user_name: selectedUserName.trim(),
      p_filter_location_id: selectedLocationId || null,
      p_filter_category_id: selectedCategoryId || null,
      p_filter_status: selectedStatus || '',
      p_filter_date_from: selectedDateFrom || null,
      p_filter_date_to: selectedDateTo || null,
    })

    if (error) {
      setErrorMessage(error.message)
      setRecords([])
      setTotalCount(0)
      return
    }

    const rpcPayload = (data ?? {}) as Partial<ExpensesRpcResponse>
    setRecords(Array.isArray(rpcPayload.records) ? rpcPayload.records : [])
    setTotalCount(typeof rpcPayload.total_count === 'number' ? rpcPayload.total_count : 0)
  }

  const fetchCurrentUserCashInHand = async () => {
    const currentEmail = getCurrentUserEmail()
    if (!currentEmail) {
      return { cashInHand: 0, error: 'Unable to find current user session.' }
    }

    const { data, error } = await supabase.rpc('get_cash_in_hand_value', {
      p_user_email: currentEmail,
    })

    if (error) {
      return { cashInHand: 0, pendingExpenses: 0, error: error.message }
    }

    const payload = (data ?? null) as CashInHandRpcResponse | null
    return {
      cashInHand: Number(payload?.cash_in_hand ?? 0),
      pendingExpenses: Number(payload?.pending_expenses ?? 0),
      error: null as string | null,
    }
  }

  const loadPageData = async (silent = false) => {
    if (!silent) setIsLoading(true)
    setErrorMessage(null)
    await fetchCategories()
    const currentUser = await fetchAllowedLocations()
    setCurrentUserContext(currentUser)
    if (!silent) setIsLoading(false)
  }

  useEffect(() => {
    if (hasFetchedOnceRef.current) return
    hasFetchedOnceRef.current = true
    if (expensesPageCache.hydrated) {
      setCurrentUserName(expensesPageCache.currentUserName)
      setCurrentUserRole(expensesPageCache.currentUserRole)
      setUserOptions(expensesPageCache.userOptions)
      setLocations(expensesPageCache.locations)
      setCategories(expensesPageCache.categories)
      setRecords(expensesPageCache.records)
      setTotalCount(expensesPageCache.totalCount)
      setCurrentPage(expensesPageCache.currentPage)
      setCurrentUserContext(expensesPageCache.currentUserContext)
      setCurrentUserEmail(expensesPageCache.currentUserEmail)
      setIsLoading(false)
      loadPageData(true)
      return
    }

    loadPageData(false)
  }, [])

  useEffect(() => {
    expensesPageCache = {
      hydrated: Boolean(currentUserEmail || records.length > 0),
      currentUserName,
      currentUserRole,
      userOptions,
      locations,
      categories,
      records,
      totalCount,
      currentPage,
      currentUserContext,
      currentUserEmail,
    }
  }, [
    currentUserName,
    currentUserRole,
    userOptions,
    locations,
    categories,
    records,
    totalCount,
    currentPage,
    currentUserContext,
    currentUserEmail,
  ])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm)
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearchTerm, filterUserName, filterLocationId, filterCategoryId, filterStatus, filterDateFrom, filterDateTo])

  useEffect(() => {
    if (!hasFetchedOnceRef.current || !currentUserContext) return

    const loadRecords = async () => {
      setIsRecordsLoading(true)
      await fetchExpenses(
        currentPage,
        debouncedSearchTerm,
        filterUserName,
        filterLocationId,
        filterCategoryId,
        filterStatus,
        filterDateFrom,
        filterDateTo
      )
      setIsRecordsLoading(false)
    }

    loadRecords()
  }, [
    currentPage,
    currentUserEmail,
    currentUserContext,
    debouncedSearchTerm,
    filterUserName,
    filterLocationId,
    filterCategoryId,
    filterStatus,
    filterDateFrom,
    filterDateTo,
  ])

  const refreshCurrentPage = async () => {
    if (!currentUserContext) return
    await fetchExpenses(
      currentPage,
      debouncedSearchTerm,
      filterUserName,
      filterLocationId,
      filterCategoryId,
      filterStatus,
      filterDateFrom,
      filterDateTo
    )
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!isFilterOpen) return
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
        setIsFilterUserDropdownOpen(false)
        setIsFilterLocationDropdownOpen(false)
        setIsFilterCategoryDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isFilterOpen])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        locationDropdownRef.current &&
        !locationDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLocationDropdownOpen(false)
      }
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCategoryDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const resetForm = () => {
    setUserName(currentUserRole === 'Admin' ? '' : currentUserName)
    setEntryDate(getTodayDateInputValue())
    setNarration('')
    setExpenseValue('')
    setLocationId('')
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
    setCategoryId('')
    setCategorySearchTerm('')
    setIsCategoryDropdownOpen(false)
    setShowValidation(false)
  }

  const closeFormModal = () => {
    setIsModalOpen(false)
    setEditingRecordId(null)
    setFormErrorMessage(null)
    resetForm()
  }

  const openAddModal = () => {
    setEditingRecordId(null)
    setFormErrorMessage(null)
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (record: ExpenseRecord) => {
    setFormErrorMessage(null)
    setEditingRecordId(record.id)
    setUserName(record.user_name)
    setEntryDate(record.entry_date ?? getTodayDateInputValue())
    setNarration(record.narration)
    setExpenseValue(record.expense_value.toString())
    setLocationId(record.location_id)
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
    setCategoryId(record.category_id)
    setCategorySearchTerm('')
    setIsCategoryDropdownOpen(false)
    setShowValidation(false)
    setIsModalOpen(true)
  }

  const handleAddOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedUserName = userName.trim()
    const effectiveUserName =
      currentUserRole === 'Admin' ? trimmedUserName : currentUserName.trim() || trimmedUserName
    const trimmedNarration = narration.trim()
    const numericExpenseValue = Number(expenseValue)

    if (
      !effectiveUserName ||
      !entryDate ||
      !trimmedNarration ||
      !locationId ||
      !categoryId ||
      !expenseValue ||
      Number.isNaN(numericExpenseValue) ||
      numericExpenseValue <= 0
    ) {
      setShowValidation(true)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    setFormErrorMessage(null)

    const editingRecordForLimit =
      editingRecordId !== null ? records.find((record) => record.id === editingRecordId) ?? null : null

    if (editingRecordId !== null && !editingRecordForLimit) {
      setFormErrorMessage('Expense record not found.')
      setIsSaving(false)
      return
    }

    if (currentUserRole !== 'Admin') {
      const { cashInHand, pendingExpenses, error } = await fetchCurrentUserCashInHand()
      if (error) {
        setFormErrorMessage(error)
        setIsSaving(false)
        return
      }

      let availableNetCash = cashInHand - pendingExpenses

      // While editing an existing pending record, add its old value back to avoid false limit block.
      if (editingRecordForLimit?.status === 'Pending') {
        availableNetCash += Number(editingRecordForLimit.expense_value ?? 0)
      }

      if (numericExpenseValue > availableNetCash) {
        setFormErrorMessage(
          `Expense value cannot exceed your Net Cash in Hand (${formatCurrency(availableNetCash)}).`
        )
        setIsSaving(false)
        return
      }
    }

    if (editingRecordId !== null) {
      const editingRecord = editingRecordForLimit
      if (!editingRecord) {
        setFormErrorMessage('Expense record not found.')
        setIsSaving(false)
        return
      }
      if (currentUserRole !== 'Admin' && editingRecord.status === 'Approved') {
        setFormErrorMessage('Approved expenses cannot be edited.')
        setIsSaving(false)
        setIsModalOpen(false)
        return
      }

      const { data, error } = await supabase
        .from('expenses')
        .update({
          user_name: effectiveUserName,
          entry_date: entryDate,
          narration: trimmedNarration,
          expense_value: numericExpenseValue,
          location_id: locationId,
          category_id: categoryId,
        })
        .eq('id', editingRecordId)
        .select(
          'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, locations(id, shop_name), categories(id, name)'
        )
        .single()

      if (error) {
        setFormErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      setRecords((prev) => prev.map((record) => (record.id === editingRecordId ? (data as ExpenseRecord) : record)))
    } else {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_name: effectiveUserName,
          entry_date: entryDate,
          narration: trimmedNarration,
          expense_value: numericExpenseValue,
          location_id: locationId,
          category_id: categoryId,
          status: 'Pending',
        })
        .select(
          'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, locations(id, shop_name), categories(id, name)'
        )
        .single()

      if (error) {
        setFormErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      if (currentPage !== 1) {
        setCurrentPage(1)
      } else {
        await refreshCurrentPage()
      }
    }

    setIsSaving(false)
    setIsModalOpen(false)
    setEditingRecordId(null)
    resetForm()
  }

  const handleDeleteConfirm = async () => {
    if (deleteRecordId === null) return
    setIsDeleting(true)
    setErrorMessage(null)

    const targetRecord = records.find((record) => record.id === deleteRecordId)
    if (!targetRecord) {
      setErrorMessage('Expense record not found.')
      setDeleteRecordId(null)
      setIsDeleting(false)
      return
    }
    if (currentUserRole !== 'Admin' && targetRecord.status === 'Approved') {
      setErrorMessage('Approved expenses cannot be deleted.')
      setDeleteRecordId(null)
      setIsDeleting(false)
      return
    }

    const { error } = await supabase.from('expenses').delete().eq('id', deleteRecordId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    await refreshCurrentPage()
    setDeleteRecordId(null)
    setActionMenu(null)
    setIsDeleting(false)
  }

  const handleApproveConfirm = async () => {
    if (approveRecordId === null) return
    if (currentUserRole !== 'Admin') {
      setErrorMessage('Only Admin can approve expenses.')
      setApproveRecordId(null)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('expenses')
      .update({ status: 'Approved' })
      .eq('id', approveRecordId)
      .select(
        'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, locations(id, shop_name), categories(id, name)'
      )
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    setRecords((prev) => prev.map((record) => (record.id === approveRecordId ? (data as ExpenseRecord) : record)))
    setApproveRecordId(null)
    setActionMenu(null)
    setIsSaving(false)
  }

  const getLocationName = (record: ExpenseRecord) => {
    const locationRecord = Array.isArray(record.locations) ? record.locations[0] : record.locations
    return locationRecord?.shop_name ?? '-'
  }

  const getCategoryName = (record: ExpenseRecord) => {
    const categoryRecord = Array.isArray(record.categories) ? record.categories[0] : record.categories
    return categoryRecord?.name ?? '-'
  }

  const getShortNarration = (text: string) => {
    const trimmed = text.trim()
    if (trimmed.length <= 45) return trimmed
    return `${trimmed.slice(0, 45)}...`
  }

  const formatCurrency = (value: number) => `Rs. ${value.toLocaleString('en-PK')}`
  const formatEntryDate = (value: string) =>
    new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })

  const isUserNameInvalid = showValidation && userName.trim().length === 0
  const isEntryDateInvalid = showValidation && entryDate.trim().length === 0
  const isNarrationInvalid = showValidation && narration.trim().length === 0
  const isExpenseValueInvalid =
    showValidation && (!expenseValue || Number.isNaN(Number(expenseValue)) || Number(expenseValue) <= 0)
  const isLocationInvalid = showValidation && !locationId
  const isCategoryInvalid = showValidation && !categoryId
  const normalizedLocationSearch = locationSearchTerm.trim().toLowerCase()
  const filteredLocationOptions =
    normalizedLocationSearch.length === 0
      ? locations
      : locations.filter((location) =>
          location.shop_name.toLowerCase().includes(normalizedLocationSearch)
        )
  const selectedLocationLabel =
    locations.find((location) => location.id === locationId)?.shop_name ?? 'Select location'

  const normalizedCategorySearch = categorySearchTerm.trim().toLowerCase()
  const filteredCategoryOptions =
    normalizedCategorySearch.length === 0
      ? categories
      : categories.filter((category) => category.name.toLowerCase().includes(normalizedCategorySearch))

  const selectedCategoryLabel =
    categories.find((category) => category.id === categoryId)?.name ?? 'Select category'
  const filteredFilterUserOptions =
    filterUserSearchTerm.trim().length === 0
      ? userOptions
      : userOptions.filter((name) =>
          name.toLowerCase().includes(filterUserSearchTerm.trim().toLowerCase())
        )
  const filteredFilterLocationOptions =
    filterLocationSearchTerm.trim().length === 0
      ? locations
      : locations.filter((location) =>
          location.shop_name.toLowerCase().includes(filterLocationSearchTerm.trim().toLowerCase())
        )
  const filteredFilterCategoryOptions =
    filterCategorySearchTerm.trim().length === 0
      ? categories
      : categories.filter((category) =>
          category.name.toLowerCase().includes(filterCategorySearchTerm.trim().toLowerCase())
        )

  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE))
  const showRecordsLoading = (isLoading || isRecordsLoading) && records.length === 0

  const selectedActionRecord = actionMenu
    ? records.find((record) => record.id === actionMenu.recordId) ?? null
    : null
  const isEditDeleteBlockedForCurrentUser =
    selectedActionRecord?.status === 'Approved' && currentUserRole !== 'Admin'
  const selectedViewRecord = viewRecordId
    ? records.find((record) => record.id === viewRecordId) ?? null
    : null
  const showUserColumn = currentUserRole === 'Admin'

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 space-y-3 md:flex md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center justify-between md:block">
          <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:hidden"
          >
            Add Expense
          </button>
        </div>
        <div
          ref={filterPopoverRef}
          className="relative flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
        >
          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className="hidden items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 md:inline-flex"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filter</span>
          </button>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search expenses..."
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-11 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className="absolute right-1 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 md:hidden"
              aria-label="Open filters"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={openAddModal}
            className="hidden items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:inline-flex"
          >
            Add Expense
          </button>

          {isFilterOpen ? (
            <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-md border-2 border-gray-400 bg-white p-3 shadow-lg">
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
                          setIsFilterUserDropdownOpen((prev) => !prev)
                          setFilterUserSearchTerm('')
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      >
                        <span className="truncate text-left">{filterUserName || 'All Users'}</span>
                        <ChevronDown className="h-4 w-4 text-gray-500" />
                      </button>
                      {isFilterUserDropdownOpen ? (
                        <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-md border border-gray-300 bg-white p-2 shadow-lg">
                          <input
                            type="text"
                            value={filterUserSearchTerm}
                            onChange={(event) => setFilterUserSearchTerm(event.target.value)}
                            placeholder="Search user..."
                            className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setFilterUserName('')
                              setIsFilterUserDropdownOpen(false)
                            }}
                            className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                              !filterUserName
                                ? 'bg-blue-50 font-medium text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            All Users
                          </button>
                          {filteredFilterUserOptions.length === 0 ? (
                            <p className="px-2 py-2 text-sm text-gray-500">No user found.</p>
                          ) : (
                            filteredFilterUserOptions.map((name) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  setFilterUserName(name)
                                  setIsFilterUserDropdownOpen(false)
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
                    Entry Date Range
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

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Location
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFilterLocationDropdownOpen((prev) => !prev)
                        setFilterLocationSearchTerm('')
                      }}
                      className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <span className="truncate text-left">{filterLocationInput || 'All Locations'}</span>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </button>
                    {isFilterLocationDropdownOpen ? (
                      <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-md border border-gray-300 bg-white p-2 shadow-lg">
                        <input
                          type="text"
                          value={filterLocationSearchTerm}
                          onChange={(event) => setFilterLocationSearchTerm(event.target.value)}
                          placeholder="Search location..."
                          className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFilterLocationId('')
                            setFilterLocationInput('')
                            setIsFilterLocationDropdownOpen(false)
                          }}
                          className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                            !filterLocationId
                              ? 'bg-blue-50 font-medium text-blue-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          All Locations
                        </button>
                        {filteredFilterLocationOptions.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-gray-500">No location found.</p>
                        ) : (
                          filteredFilterLocationOptions.map((location) => (
                            <button
                              key={location.id}
                              type="button"
                              onClick={() => {
                                setFilterLocationId(location.id)
                                setFilterLocationInput(location.shop_name)
                                setIsFilterLocationDropdownOpen(false)
                              }}
                              className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                                filterLocationId === location.id
                                  ? 'bg-blue-50 font-medium text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {location.shop_name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Category
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setIsFilterCategoryDropdownOpen((prev) => !prev)
                        setFilterCategorySearchTerm('')
                      }}
                      className="flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <span className="truncate text-left">{filterCategoryInput || 'All Categories'}</span>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </button>
                    {isFilterCategoryDropdownOpen ? (
                      <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-md border border-gray-300 bg-white p-2 shadow-lg">
                        <input
                          type="text"
                          value={filterCategorySearchTerm}
                          onChange={(event) => setFilterCategorySearchTerm(event.target.value)}
                          placeholder="Search category..."
                          className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setFilterCategoryId('')
                            setFilterCategoryInput('')
                            setIsFilterCategoryDropdownOpen(false)
                          }}
                          className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                            !filterCategoryId
                              ? 'bg-blue-50 font-medium text-blue-700'
                              : 'text-gray-700 hover:bg-gray-50'
                          }`}
                        >
                          All Categories
                        </button>
                        {filteredFilterCategoryOptions.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-gray-500">No category found.</p>
                        ) : (
                          filteredFilterCategoryOptions.map((category) => (
                            <button
                              key={category.id}
                              type="button"
                              onClick={() => {
                                setFilterCategoryId(category.id)
                                setFilterCategoryInput(category.name)
                                setIsFilterCategoryDropdownOpen(false)
                              }}
                              className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                                filterCategoryId === category.id
                                  ? 'bg-blue-50 font-medium text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {category.name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(event) => setFilterStatus(event.target.value as ExpenseStatus | '')}
                    className="w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">All Status</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                  </select>
                </div>

                <div className="flex justify-end gap-2 border-t pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFilterUserName('')
                      setIsFilterUserDropdownOpen(false)
                      setFilterUserSearchTerm('')
                      setFilterLocationId('')
                      setFilterLocationInput('')
                      setIsFilterLocationDropdownOpen(false)
                      setFilterLocationSearchTerm('')
                      setFilterCategoryId('')
                      setFilterCategoryInput('')
                      setIsFilterCategoryDropdownOpen(false)
                      setFilterCategorySearchTerm('')
                      setFilterStatus('')
                      setFilterDateFrom('')
                      setFilterDateTo('')
                    }}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsFilterOpen(false)
                      setIsFilterUserDropdownOpen(false)
                      setIsFilterLocationDropdownOpen(false)
                      setIsFilterCategoryDropdownOpen(false)
                    }}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    Apply
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

      <div className="hidden rounded-lg bg-white shadow md:block">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="min-w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
              <tr>
                {showUserColumn ? (
                  <th className="px-4 py-3 text-left text-sm font-semibold text-white">User Name</th>
                ) : null}
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Entry Date</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Narration</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Value</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Location</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Category</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {showRecordsLoading ? (
                <tr>
                  <td colSpan={showUserColumn ? 8 : 7} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading expenses...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={showUserColumn ? 8 : 7} className="px-4 py-6 text-center text-sm text-gray-500">
                    No expenses found.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="border-t">
                    {showUserColumn ? (
                      <td className="px-4 py-3 text-sm text-gray-700">{record.user_name}</td>
                    ) : null}
                    <td className="px-4 py-3 text-sm text-gray-700">{formatEntryDate(record.entry_date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700" title={record.narration}>
                      <span className="block max-w-[220px] truncate whitespace-nowrap lg:max-w-[300px]">
                        {getShortNarration(record.narration)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {formatCurrency(record.expense_value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{getLocationName(record)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{getCategoryName(record)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                          record.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          const buttonRect = event.currentTarget.getBoundingClientRect()
                          const estimatedMenuHeight = currentUserRole === 'Admin' ? 132 : 92
                          const spaceBelow = window.innerHeight - buttonRect.bottom
                          const shouldOpenUp = spaceBelow < estimatedMenuHeight && buttonRect.top > estimatedMenuHeight

                          setActionMenu((prev) =>
                            prev?.recordId === record.id
                              ? null
                              : {
                                  recordId: record.id,
                                  top: shouldOpenUp ? buttonRect.top - 6 : buttonRect.bottom + 6,
                                  left: buttonRect.right,
                                  openUp: shouldOpenUp,
                                }
                          )
                        }}
                        className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                        aria-label="Open expense actions"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 space-y-3 md:hidden">
        {showRecordsLoading ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            Loading expenses...
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            No expenses found.
          </div>
        ) : (
          records.map((record) => {
            const isLockedForNonAdmin = currentUserRole !== 'Admin' && record.status === 'Approved'

            return (
              <div
                key={record.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setViewRecordId(record.id)
                  setMobileActionMenuId(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    setViewRecordId(record.id)
                    setMobileActionMenuId(null)
                  }
                }}
                className="relative rounded-xl bg-white px-4 py-3 shadow"
              >
                <div className="space-y-2 pr-10">
                  <div className="flex items-center justify-between gap-2">
                    {currentUserRole === 'Admin' ? (
                      <p className="truncate text-sm font-semibold text-gray-900">{record.user_name}</p>
                    ) : (
                      <p className="text-sm font-semibold text-gray-900">
                        {formatEntryDate(record.entry_date)}
                      </p>
                    )}
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        record.status === 'Approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {record.status}
                    </span>
                  </div>
                  {currentUserRole === 'Admin' ? (
                    <p className="text-xs text-gray-500">{formatEntryDate(record.entry_date)}</p>
                  ) : null}
                  <p className="truncate whitespace-nowrap text-sm text-gray-700">
                    {getShortNarration(record.narration)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-800">{formatCurrency(record.expense_value)}</p>
                    <p className="truncate text-xs text-gray-500">{getLocationName(record)}</p>
                  </div>
                  <p className="truncate text-xs text-gray-500">{getCategoryName(record)}</p>
                </div>

                <div className="absolute right-2 top-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMobileActionMenuId((prev) => (prev === record.id ? null : record.id))
                      }}
                      className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                      aria-label="Open expense actions"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>

                    {mobileActionMenuId === record.id ? (
                      <div
                        onClick={(event) => event.stopPropagation()}
                        className="absolute right-0 top-10 z-20 min-w-[140px] rounded-md border bg-white py-1 shadow-lg"
                      >
                        {currentUserRole === 'Admin' ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (record.status === 'Approved') return
                              setApproveRecordId(record.id)
                              setMobileActionMenuId(null)
                            }}
                            disabled={record.status === 'Approved'}
                            className={`block w-full px-3 py-2 text-left text-sm ${
                              record.status === 'Approved'
                                ? 'cursor-not-allowed text-emerald-300'
                                : 'text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            setViewRecordId(record.id)
                            setMobileActionMenuId(null)
                          }}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          View
                        </button>
                        {!isLockedForNonAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              openEditModal(record)
                              setMobileActionMenuId(null)
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                          >
                            Edit
                          </button>
                        ) : null}
                        {!isLockedForNonAdmin ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteRecordId(record.id)
                              setMobileActionMenuId(null)
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {totalCount > 0 ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2">
          <p className="text-xs text-gray-600 sm:text-sm">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || isRecordsLoading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || isRecordsLoading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {mobileActionMenuId !== null ? (
        <button
          type="button"
          aria-label="Close mobile action menu"
          onClick={() => setMobileActionMenuId(null)}
          className="fixed inset-0 z-10 bg-transparent md:hidden"
        />
      ) : null}

      {actionMenu ? (
        <>
          <button
            type="button"
            aria-label="Close action menu"
            onClick={() => setActionMenu(null)}
            className="fixed inset-0 z-20 cursor-default bg-transparent"
          />
          <div
            className="fixed z-30 min-w-[140px] rounded-md border bg-white py-1 shadow-lg"
            style={{
              top: actionMenu.top,
              left: actionMenu.left,
              transform: `translate(-100%, ${actionMenu.openUp ? '-100%' : '0'})`,
            }}
          >
            {currentUserRole === 'Admin' ? (
              <button
                type="button"
                onClick={() => {
                  if (!selectedActionRecord || selectedActionRecord.status === 'Approved') return
                  setApproveRecordId(actionMenu.recordId)
                  setActionMenu(null)
                }}
                disabled={selectedActionRecord?.status === 'Approved'}
                className={`block w-full px-3 py-2 text-left text-sm ${
                  selectedActionRecord?.status === 'Approved'
                    ? 'cursor-not-allowed text-emerald-300'
                    : 'text-emerald-600 hover:bg-emerald-50'
                }`}
              >
                Approve
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setViewRecordId(actionMenu.recordId)
                setActionMenu(null)
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              View
            </button>
            {!isEditDeleteBlockedForCurrentUser ? (
              <button
                type="button"
                onClick={() => {
                  if (!selectedActionRecord) return
                  openEditModal(selectedActionRecord)
                  setActionMenu(null)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
              >
                Edit
              </button>
            ) : null}
            {!isEditDeleteBlockedForCurrentUser ? (
              <button
                type="button"
                onClick={() => {
                  setDeleteRecordId(actionMenu.recordId)
                  setActionMenu(null)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingRecordId !== null ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close modal"
              >
                X
              </button>
            </div>

            <form onSubmit={handleAddOrUpdate} className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              {formErrorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formErrorMessage}
                </div>
              ) : null}

              <div>
                <label htmlFor="expense-user-name" className="mb-1 block text-sm font-medium text-gray-700">
                  User Name
                </label>
                {currentUserRole === 'Admin' ? (
                  <select
                    id="expense-user-name"
                    value={userName}
                    onChange={(event) => setUserName(event.target.value)}
                    className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-1 ${
                      isUserNameInvalid
                        ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                  >
                    <option value="">Select user</option>
                    {userOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="expense-user-name"
                    type="text"
                    value={userName}
                    readOnly
                    className={`w-full rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-900 outline-none ${
                      isUserNameInvalid ? 'border border-red-500' : 'border border-gray-300'
                    }`}
                  />
                )}
                {isUserNameInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">User Name is required.</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="expense-entry-date" className="mb-1 block text-sm font-medium text-gray-700">
                  Entry Date
                </label>
                <input
                  id="expense-entry-date"
                  type="date"
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-1 ${
                    isEntryDateInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isEntryDateInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Entry Date is required.</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="expense-narration" className="mb-1 block text-sm font-medium text-gray-700">
                  Narration
                </label>
                <textarea
                  id="expense-narration"
                  value={narration}
                  onChange={(event) => setNarration(event.target.value)}
                  placeholder="Enter narration"
                  rows={3}
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isNarrationInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isNarrationInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Narration is required.</p>
                ) : null}
              </div>

              <div>
                <label htmlFor="expense-value" className="mb-1 block text-sm font-medium text-gray-700">
                  Value (Rs.)
                </label>
                <input
                  id="expense-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={expenseValue}
                  onChange={(event) => setExpenseValue(event.target.value)}
                  placeholder="Enter amount in Rs."
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isExpenseValueInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isExpenseValueInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Value must be greater than 0.</p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div ref={locationDropdownRef}>
                    <p className="mb-1 block text-sm font-medium text-gray-700">Location</p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsLocationDropdownOpen((prev) => !prev)
                        setLocationSearchTerm('')
                      }}
                      className={`flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-sm outline-none focus:ring-1 ${
                        isLocationInvalid
                          ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                          : 'border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500'
                      }`}
                    >
                      <span className="truncate text-left">{selectedLocationLabel}</span>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </button>

                    {isLocationDropdownOpen ? (
                      <div className="absolute z-20 mt-1 max-h-52 w-[calc(100%-2.5rem)] overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg sm:w-[230px]">
                        <input
                          type="text"
                          value={locationSearchTerm}
                          onChange={(event) => setLocationSearchTerm(event.target.value)}
                          placeholder="Search location..."
                          className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        {filteredLocationOptions.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-gray-500">No location found.</p>
                        ) : (
                          filteredLocationOptions.map((location) => (
                            <button
                              key={location.id}
                              type="button"
                              onClick={() => {
                                setLocationId(location.id)
                                setIsLocationDropdownOpen(false)
                                setLocationSearchTerm('')
                              }}
                              className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                                locationId === location.id
                                  ? 'bg-blue-50 font-medium text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {location.shop_name}
                            </button>
                          ))
                        )}
                      </div>
                    ) : null}

                    {isLocationInvalid ? (
                      <p className="mt-1 text-xs font-medium text-red-600">Location is required.</p>
                    ) : null}
                  </div>
                </div>

                <div ref={categoryDropdownRef}>
                  <p className="mb-1 block text-sm font-medium text-gray-700">Category</p>
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen((prev) => !prev)}
                    className={`flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-sm outline-none focus:ring-1 ${
                      isCategoryInvalid
                        ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                  >
                    <span className="truncate text-left">{selectedCategoryLabel}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </button>

                  {isCategoryDropdownOpen ? (
                    <div className="absolute z-20 mt-1 max-h-52 w-[calc(100%-2.5rem)] overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg sm:w-[230px]">
                      <input
                        type="text"
                        value={categorySearchTerm}
                        onChange={(event) => setCategorySearchTerm(event.target.value)}
                        placeholder="Search category..."
                        className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                      {filteredCategoryOptions.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-gray-500">No category found.</p>
                      ) : (
                        filteredCategoryOptions.map((category) => (
                          <button
                            key={category.id}
                            type="button"
                            onClick={() => {
                              setCategoryId(category.id)
                              setIsCategoryDropdownOpen(false)
                              setCategorySearchTerm('')
                            }}
                            className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                              categoryId === category.id
                                ? 'bg-blue-50 font-medium text-blue-700'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {category.name}
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}

                  {isCategoryInvalid ? (
                    <p className="mt-1 text-xs font-medium text-red-600">Category is required.</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeFormModal}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {isSaving ? 'Saving...' : editingRecordId !== null ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Expense</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteRecordId(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {approveRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Approve Expense</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve this expense?
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setApproveRecordId(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApproveConfirm}
                  disabled={isSaving}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  {isSaving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedViewRecord ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Expense Details</h2>
              <button
                type="button"
                onClick={() => setViewRecordId(null)}
                className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close details modal"
              >
                X
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 md:px-5 md:py-5">
              {currentUserRole === 'Admin' ? (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">User Name</p>
                  <p className="mt-1 text-sm text-gray-800">{selectedViewRecord.user_name}</p>
                </div>
              ) : null}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Entry Date</p>
                <p className="mt-1 text-sm text-gray-800">{formatEntryDate(selectedViewRecord.entry_date)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Narration</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">
                  {selectedViewRecord.narration}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Value</p>
                <p className="mt-1 text-sm text-gray-800">{formatCurrency(selectedViewRecord.expense_value)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Location</p>
                <p className="mt-1 text-sm text-gray-800">{getLocationName(selectedViewRecord)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Category</p>
                <p className="mt-1 text-sm text-gray-800">{getCategoryName(selectedViewRecord)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
                <span
                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                    selectedViewRecord.status === 'Approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {selectedViewRecord.status}
                </span>
              </div>
              <div className="flex justify-end border-t pt-4">
                <button
                  type="button"
                  onClick={() => setViewRecordId(null)}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
