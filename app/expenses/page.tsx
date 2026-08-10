'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadAttachments } from '@/lib/attachment-upload'
import { HEAD_OFFICE_SHOP_NAME, isHeadOfficeName } from '@/lib/locations'
import { CheckCircle, ChevronDown, MoreVertical, SlidersHorizontal } from 'lucide-react'

type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected'
type UserRole = 'Admin' | 'Managment' | 'Viewer'
type AdminAccess = 'All Access' | 'Edit and Delete' | 'Approvals Only'

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
  attachment_urls: string[]
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
  admin_access: AdminAccess | null
}

interface ActionMenuState {
  recordId: number
  top: number
  left: number
  openUp: boolean
}

interface ExpensesRpcResponse {
  total_count: number
  total_value: number
  records: ExpenseRecord[]
}

interface TimelineEntry {
  id: number
  action: string
  actor_name: string | null
  actor_email: string | null
  details: Record<string, unknown> | null
  created_at: string
}

const canApproveRecord = (
  status: ExpenseStatus,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => role === 'Admin' && status === 'Pending' && (adminAccess === 'All Access' || adminAccess === 'Approvals Only')

const canRejectRecord = (
  status: ExpenseStatus,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) =>
  role === 'Admin' &&
  status === 'Pending' &&
  (adminAccess === 'All Access' || adminAccess === 'Approvals Only' || adminAccess === 'Edit and Delete')

const isRejectedStatus = (status: string) => status.trim().toLowerCase() === 'rejected'

const getExpenseStatusBadgeClass = (status: ExpenseStatus | string) => {
  if (status === 'Approved') return 'bg-emerald-100 text-emerald-700'
  if (isRejectedStatus(status)) return 'bg-red-600 text-white'
  return 'bg-amber-100 text-amber-700'
}

const getRejectedRowClass = (status: ExpenseStatus | string) =>
  isRejectedStatus(status) ? 'border-t bg-red-50 text-red-700' : 'border-t'

const getExpenseRowTextClass = (
  status: ExpenseStatus | string,
  tone: 'default' | 'strong' | 'title' | 'muted' = 'default'
) => {
  if (!isRejectedStatus(status)) {
    if (tone === 'strong') return 'text-sm font-medium text-gray-800'
    if (tone === 'title') return 'text-sm font-semibold text-gray-900'
    if (tone === 'muted') return 'text-xs text-gray-500'
    return 'text-sm text-gray-700'
  }

  if (tone === 'strong') return 'text-sm font-medium text-red-800'
  if (tone === 'title') return 'text-sm font-semibold text-red-800'
  if (tone === 'muted') return 'text-xs text-red-600'
  return 'text-sm text-red-700'
}

const getExpenseRowActionClass = (status: ExpenseStatus | string) =>
  isRejectedStatus(status) ? 'rounded-md p-2 text-red-600 hover:bg-red-100' : 'rounded-md p-2 text-gray-600 hover:bg-gray-100'

const canEditRecord = (
  record: ExpenseRecord,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => {
  if (role === 'Admin') {
    if (adminAccess === 'Approvals Only') return false
    if (adminAccess === 'Edit and Delete') return record.status === 'Pending'
    return true
  }

  return record.status === 'Pending'
}

const canDeleteRecord = (
  record: ExpenseRecord,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => canEditRecord(record, role, adminAccess)

type ExpenseEntryMode = 'normal' | 'transfer'

const canUseAdvancedExpenseForm = (role: UserRole | null, adminAccess: AdminAccess | null) =>
  role === 'Admin' && (adminAccess === 'All Access' || adminAccess === 'Edit and Delete')

const EXPENSE_SELECT_FIELDS =
  'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, attachment_urls, locations(id, shop_name), categories(id, name)'

let expensesPageCache: {
  hydrated: boolean
  currentUserName: string
  currentUserRole: UserRole | null
  currentUserAdminAccess: AdminAccess | null
  userOptions: string[]
  locations: LocationOption[]
  categories: CategoryOption[]
  records: ExpenseRecord[]
  totalCount: number
  tableValueTotal: number
  currentPage: number
  currentUserContext: CurrentUserContext | null
  currentUserEmail: string
} = {
  hydrated: false,
  currentUserName: '',
  currentUserRole: null,
  currentUserAdminAccess: null,
  userOptions: [],
  locations: [],
  categories: [],
  records: [],
  totalCount: 0,
  tableValueTotal: 0,
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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [existingAttachmentUrls, setExistingAttachmentUrls] = useState<string[]>([])
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
  const [currentUserAdminAccess, setCurrentUserAdminAccess] = useState<AdminAccess | null>(null)
  const [userOptions, setUserOptions] = useState<string[]>([])
  const [records, setRecords] = useState<ExpenseRecord[]>([])
  const [tableValueTotal, setTableValueTotal] = useState(0)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null)
  const [approveRecordId, setApproveRecordId] = useState<number | null>(null)
  const [rejectRecordId, setRejectRecordId] = useState<number | null>(null)
  const [viewRecordId, setViewRecordId] = useState<number | null>(null)
  const [timelineRecordId, setTimelineRecordId] = useState<number | null>(null)
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([])
  const [isTimelineLoading, setIsTimelineLoading] = useState(false)
  const [timelineError, setTimelineError] = useState<string | null>(null)
  const [isApproveAllConfirmOpen, setIsApproveAllConfirmOpen] = useState(false)
  const [actionMenu, setActionMenu] = useState<ActionMenuState | null>(null)
  const [mobileActionMenuId, setMobileActionMenuId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRecordsLoading, setIsRecordsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isApprovingAll, setIsApprovingAll] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [currentUserContext, setCurrentUserContext] = useState<CurrentUserContext | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const [entryMode, setEntryMode] = useState<ExpenseEntryMode>('normal')
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
      setCurrentUserAdminAccess(null)
      setCurrentUserName('')
      return null
    }
    setCurrentUserEmail(currentEmail)

    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, role, user_name, admin_access')
      .eq('user_email', currentEmail)
      .single<{ id: number; role: UserRole; user_name: string; admin_access: AdminAccess | null }>()

    if (currentUserError || !currentUser) {
      setErrorMessage(currentUserError?.message ?? 'User not found.')
      setLocations([])
      setUserOptions([])
      setCurrentUserRole(null)
      setCurrentUserAdminAccess(null)
      setCurrentUserName('')
      return null
    }

    setCurrentUserRole(currentUser.role)
    setCurrentUserAdminAccess(currentUser.admin_access)
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
      setTableValueTotal(0)
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
      setTableValueTotal(0)
      return
    }

    const rpcPayload = (data ?? {}) as Partial<ExpensesRpcResponse>
    const nextRecords = (Array.isArray(rpcPayload.records) ? rpcPayload.records : []).map((record) => ({
      ...record,
      attachment_urls: Array.isArray(record.attachment_urls) ? record.attachment_urls : [],
    }))
    setRecords(
      nextRecords
    )
    setTotalCount(typeof rpcPayload.total_count === 'number' ? rpcPayload.total_count : 0)
    setTableValueTotal(
      typeof rpcPayload.total_value === 'number'
        ? rpcPayload.total_value
        : nextRecords.reduce((total, record) => total + Number(record.expense_value || 0), 0)
    )
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
      setCurrentUserAdminAccess(expensesPageCache.currentUserAdminAccess)
      setUserOptions(expensesPageCache.userOptions)
      setLocations(expensesPageCache.locations)
      setCategories(expensesPageCache.categories)
      setRecords(expensesPageCache.records)
      setTotalCount(expensesPageCache.totalCount)
      setTableValueTotal(expensesPageCache.tableValueTotal)
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
      currentUserAdminAccess,
      userOptions,
      locations,
      categories,
      records,
      totalCount,
      tableValueTotal,
      currentPage,
      currentUserContext,
      currentUserEmail,
    }
  }, [
    currentUserName,
    currentUserRole,
    currentUserAdminAccess,
    userOptions,
    locations,
    categories,
    records,
    totalCount,
    tableValueTotal,
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
    setSelectedFiles([])
    setExistingAttachmentUrls([])
    setLocationId('')
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
    setCategoryId('')
    setCategorySearchTerm('')
    setIsCategoryDropdownOpen(false)
    setEntryMode('normal')
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
    setSelectedFiles([])
    setExistingAttachmentUrls(record.attachment_urls ?? [])
    setLocationId(record.location_id)
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
    setCategoryId(record.category_id)
    setCategorySearchTerm('')
    setIsCategoryDropdownOpen(false)
    setEntryMode('normal')
    setShowValidation(false)
    setIsModalOpen(true)
  }

  const recordTimeline = async (
    recordId: number,
    action: string,
    details: Record<string, unknown> = {}
  ) => {
    const actorName = currentUserName.trim() || localStorage.getItem('rms_user_name') || 'Unknown user'
    const actorEmail = currentUserEmail || getCurrentUserEmail()

    await supabase.from('entry_timeline').insert({
      entry_type: 'expense',
      entry_id: recordId,
      action,
      actor_name: actorName,
      actor_email: actorEmail || null,
      details,
    })
  }

  const openTimelineModal = async (record: ExpenseRecord) => {
    setTimelineRecordId(record.id)
    setTimelineEntries([])
    setTimelineError(null)
    setIsTimelineLoading(true)
    setActionMenu(null)
    setMobileActionMenuId(null)

    const { data, error } = await supabase.rpc('get_entry_timeline', {
      p_entry_type: 'expense',
      p_entry_id: record.id,
    })

    if (error) {
      setTimelineError(error.message)
      setIsTimelineLoading(false)
      return
    }

    setTimelineEntries((Array.isArray(data) ? data : []) as TimelineEntry[])
    setIsTimelineLoading(false)
  }

  const closeTimelineModal = () => {
    setTimelineRecordId(null)
    setTimelineEntries([])
    setTimelineError(null)
    setIsTimelineLoading(false)
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
    const uploadSelectedAttachments = async (folderKey: string) =>
      uploadAttachments(selectedFiles, `expenses/${folderKey}`)

    const finishSave = (refreshList: boolean) => {
      setIsSaving(false)
      setIsModalOpen(false)
      setEditingRecordId(null)
      resetForm()
      if (refreshList) {
        if (currentPage !== 1) {
          setCurrentPage(1)
        } else {
          void refreshCurrentPage()
        }
      }
    }

    setErrorMessage(null)
    setFormErrorMessage(null)

    const editingRecordForLimit =
      editingRecordId !== null ? records.find((record) => record.id === editingRecordId) ?? null : null

    if (editingRecordId !== null && !editingRecordForLimit) {
      setFormErrorMessage('Expense record not found.')
      setIsSaving(false)
      return
    }

    if (editingRecordId !== null) {
      const editingRecord = editingRecordForLimit
      if (!editingRecord) {
        setFormErrorMessage('Expense record not found.')
        setIsSaving(false)
        return
      }
      if (!canEditRecord(editingRecord, currentUserRole, currentUserAdminAccess)) {
        setFormErrorMessage('You do not have access to edit this expense.')
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
          attachment_urls: existingAttachmentUrls,
        })
        .eq('id', editingRecordId)
        .select(
          'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, attachment_urls, locations(id, shop_name), categories(id, name)'
        )
        .single()

      if (error) {
        setFormErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      try {
        const uploadedUrls = await uploadSelectedAttachments(String(editingRecordId))
        const mergedAttachmentUrls = [...existingAttachmentUrls, ...uploadedUrls]

        if (uploadedUrls.length > 0) {
          const { data: updatedRecord, error: attachmentUpdateError } = await supabase
            .from('expenses')
            .update({ attachment_urls: mergedAttachmentUrls })
            .eq('id', editingRecordId)
            .select(
              'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, attachment_urls, locations(id, shop_name), categories(id, name)'
            )
            .single()

          if (attachmentUpdateError) {
            setFormErrorMessage(attachmentUpdateError.message)
            setIsSaving(false)
            return
          }

          setRecords((prev) =>
            prev.map((record) => (record.id === editingRecordId ? (updatedRecord as ExpenseRecord) : record))
          )
        } else {
          setRecords((prev) =>
            prev.map((record) =>
              record.id === editingRecordId
                ? {
                    ...(data as ExpenseRecord),
                    attachment_urls: existingAttachmentUrls,
                  }
                : record
            )
          )
        }
      } catch (uploadError) {
        setFormErrorMessage(uploadError instanceof Error ? uploadError.message : 'File upload failed.')
        setIsSaving(false)
        return
      }

      void recordTimeline(editingRecordId, 'Updated').catch(() => undefined)
      finishSave(false)
      return
    }

    {
      const selectedLocation = locations.find((location) => location.id === locationId) ?? null
      const headOfficeLocation = locations.find((location) => isHeadOfficeName(location.shop_name)) ?? null
      const showAdvancedExpenseForm = canUseAdvancedExpenseForm(currentUserRole, currentUserAdminAccess)
      const isTransferEntry = showAdvancedExpenseForm && entryMode === 'transfer'

      if (isTransferEntry) {
        if (!headOfficeLocation) {
          setFormErrorMessage(
            `${HEAD_OFFICE_SHOP_NAME} is not available. Please add it from Location settings first.`
          )
          setIsSaving(false)
          return
        }

        if (!locationId || locationId === headOfficeLocation.id) {
          setShowValidation(true)
          setIsSaving(false)
          return
        }

        const targetShopName = selectedLocation?.shop_name ?? 'Shop'

        let uploadedUrls: string[] = []
        try {
          if (selectedFiles.length > 0) {
            const batchKey =
              typeof crypto !== 'undefined' && 'randomUUID' in crypto
                ? crypto.randomUUID()
                : String(Date.now())
            uploadedUrls = await uploadSelectedAttachments(batchKey)
          }
        } catch (uploadError) {
          setFormErrorMessage(uploadError instanceof Error ? uploadError.message : 'File upload failed.')
          setIsSaving(false)
          return
        }

        const transferBasePayload = {
          user_name: effectiveUserName,
          entry_date: entryDate,
          category_id: categoryId,
          status: 'Approved' as ExpenseStatus,
        }

        const { data: headOfficeRecord, error: headOfficeError } = await supabase
          .from('expenses')
          .insert({
            ...transferBasePayload,
            location_id: headOfficeLocation.id,
            expense_value: -numericExpenseValue,
            narration: `Transfer to ${targetShopName}: ${trimmedNarration}`,
            attachment_urls: [],
          })
          .select(EXPENSE_SELECT_FIELDS)
          .single()

        if (headOfficeError) {
          setFormErrorMessage(headOfficeError.message)
          setIsSaving(false)
          return
        }

        const { data: shopRecord, error: shopError } = await supabase
          .from('expenses')
          .insert({
            ...transferBasePayload,
            location_id: locationId,
            expense_value: numericExpenseValue,
            narration: `Transfer from ${HEAD_OFFICE_SHOP_NAME}: ${trimmedNarration}`,
            attachment_urls: uploadedUrls,
          })
          .select(EXPENSE_SELECT_FIELDS)
          .single()

        if (shopError) {
          await supabase.from('expenses').delete().eq('id', (headOfficeRecord as ExpenseRecord).id)
          setFormErrorMessage(shopError.message)
          setIsSaving(false)
          return
        }

        const shopRecordId = (shopRecord as ExpenseRecord).id

        void recordTimeline((headOfficeRecord as ExpenseRecord).id, 'Transfer', {
          transfer_type: 'out',
          target_shop: targetShopName,
        }).catch(() => undefined)
        void recordTimeline(shopRecordId, 'Transfer', {
          transfer_type: 'in',
          source: HEAD_OFFICE_SHOP_NAME,
        }).catch(() => undefined)
        finishSave(true)
        return
      }

      const shouldAutoApprove =
        showAdvancedExpenseForm &&
        entryMode === 'normal' &&
        isHeadOfficeName(selectedLocation?.shop_name ?? '')

      let uploadedUrls: string[] = []
      try {
        if (selectedFiles.length > 0) {
          const batchKey =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : String(Date.now())
          uploadedUrls = await uploadSelectedAttachments(batchKey)
        }
      } catch (uploadError) {
        setFormErrorMessage(uploadError instanceof Error ? uploadError.message : 'File upload failed.')
        setIsSaving(false)
        return
      }

      const { data, error } = await supabase
        .from('expenses')
        .insert({
          user_name: effectiveUserName,
          entry_date: entryDate,
          narration: trimmedNarration,
          expense_value: numericExpenseValue,
          location_id: locationId,
          category_id: categoryId,
          status: shouldAutoApprove ? 'Approved' : 'Pending',
          attachment_urls: uploadedUrls,
        })
        .select(EXPENSE_SELECT_FIELDS)
        .single()

      if (error) {
        setFormErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      void recordTimeline((data as ExpenseRecord).id, shouldAutoApprove ? 'Approved' : 'Added').catch(
        () => undefined
      )
      finishSave(true)
    }
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
    if (!canDeleteRecord(targetRecord, currentUserRole, currentUserAdminAccess)) {
      setErrorMessage('You do not have access to delete this expense.')
      setDeleteRecordId(null)
      setIsDeleting(false)
      return
    }

    const deletedRecordId = deleteRecordId
    const { error } = await supabase.from('expenses').delete().eq('id', deletedRecordId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    await recordTimeline(deletedRecordId, 'Deleted').catch(() => undefined)
    await refreshCurrentPage()
    setDeleteRecordId(null)
    setActionMenu(null)
    setIsDeleting(false)
  }

  const handleApproveConfirm = async () => {
    if (approveRecordId === null) return
    const targetRecord = records.find((record) => record.id === approveRecordId)
    if (!targetRecord || !canApproveRecord(targetRecord.status, currentUserRole, currentUserAdminAccess)) {
      setErrorMessage('You do not have access to approve this expense.')
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
        'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, attachment_urls, locations(id, shop_name), categories(id, name)'
      )
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    await recordTimeline(approveRecordId, 'Approved').catch(() => undefined)
    setRecords((prev) => prev.map((record) => (record.id === approveRecordId ? (data as ExpenseRecord) : record)))
    setApproveRecordId(null)
    setActionMenu(null)
    setIsSaving(false)
  }

  const handleRejectConfirm = async () => {
    if (rejectRecordId === null) return
    const targetRecord = records.find((record) => record.id === rejectRecordId)
    if (!targetRecord || !canRejectRecord(targetRecord.status, currentUserRole, currentUserAdminAccess)) {
      setErrorMessage('You do not have access to reject this expense.')
      setRejectRecordId(null)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('expenses')
      .update({ status: 'Rejected' })
      .eq('id', rejectRecordId)
      .select(
        'id, user_name, entry_date, narration, expense_value, location_id, category_id, status, attachment_urls, locations(id, shop_name), categories(id, name)'
      )
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    await recordTimeline(rejectRecordId, 'Rejected').catch(() => undefined)
    setRecords((prev) => prev.map((record) => (record.id === rejectRecordId ? (data as ExpenseRecord) : record)))
    setRejectRecordId(null)
    setActionMenu(null)
    setIsSaving(false)
  }

  const handleApproveAllVisible = async () => {
    const pendingRecords = records.filter((record) =>
      canApproveRecord(record.status, currentUserRole, currentUserAdminAccess)
    )

    if (pendingRecords.length === 0) return

    setIsApprovingAll(true)
    setErrorMessage(null)

    const recordIds = pendingRecords.map((record) => record.id)
    const { error } = await supabase.from('expenses').update({ status: 'Approved' }).in('id', recordIds)

    if (error) {
      setErrorMessage(error.message)
      setIsApprovingAll(false)
      return
    }

    await Promise.all(pendingRecords.map((record) => recordTimeline(record.id, 'Approved').catch(() => undefined)))
    await refreshCurrentPage()
    setActionMenu(null)
    setMobileActionMenuId(null)
    setIsApproveAllConfirmOpen(false)
    setIsApprovingAll(false)
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
  const formatDateTime = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(/\b(am|pm)\b/i, (match) => match.toUpperCase())
  const getTimelineDetailEntries = (details: Record<string, unknown> | null) => {
    const hiddenKeys = new Set([
      'value',
      'status',
      'user_name',
      'entry_date',
      'category_id',
      'location_id',
      'from_status',
      'to_status',
      'source',
    ])

    return Object.entries(details ?? {}).filter(([key]) => !hiddenKeys.has(key))
  }

  const isUserNameInvalid = showValidation && userName.trim().length === 0
  const isEntryDateInvalid = showValidation && entryDate.trim().length === 0
  const isNarrationInvalid = showValidation && narration.trim().length === 0
  const isExpenseValueInvalid =
    showValidation && (!expenseValue || Number.isNaN(Number(expenseValue)) || Number(expenseValue) <= 0)
  const showAdvancedExpenseForm = canUseAdvancedExpenseForm(currentUserRole, currentUserAdminAccess)
  const isTransferEntryMode =
    showAdvancedExpenseForm && editingRecordId === null && entryMode === 'transfer'
  const selectedFormLocation = locations.find((location) => location.id === locationId) ?? null
  const isLocationInvalid =
    showValidation &&
    (isTransferEntryMode
      ? !locationId || isHeadOfficeName(selectedFormLocation?.shop_name ?? '')
      : !locationId)
  const isCategoryInvalid = showValidation && !categoryId
  const normalizedLocationSearch = locationSearchTerm.trim().toLowerCase()
  const filteredLocationOptions =
    normalizedLocationSearch.length === 0
      ? locations
      : locations.filter((location) =>
          location.shop_name.toLowerCase().includes(normalizedLocationSearch)
        )
  const formLocationOptions = isTransferEntryMode
    ? filteredLocationOptions.filter((location) => !isHeadOfficeName(location.shop_name))
    : filteredLocationOptions
  const selectedLocationLabel = isTransferEntryMode
    ? selectedFormLocation?.shop_name ?? 'Select shop'
    : selectedFormLocation?.shop_name ?? 'Select location'

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
    selectedActionRecord
      ? !canEditRecord(selectedActionRecord, currentUserRole, currentUserAdminAccess)
      : false
  const selectedViewRecord = viewRecordId
    ? records.find((record) => record.id === viewRecordId) ?? null
    : null
  const showUserColumn = currentUserRole === 'Admin'
  const visiblePendingApprovalCount = records.filter((record) =>
    canApproveRecord(record.status, currentUserRole, currentUserAdminAccess)
  ).length

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

          <button
            type="button"
            onClick={() => setIsApproveAllConfirmOpen(true)}
            disabled={visiblePendingApprovalCount === 0 || isApprovingAll || isRecordsLoading}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-200 disabled:text-gray-500"
            title="Approve all visible pending expenses"
          >
            <CheckCircle className="h-4 w-4" />
            <span>{isApprovingAll ? 'Approving...' : 'Approve All'}</span>
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
                    <option value="Rejected">Rejected</option>
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

      <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Table Value Total</p>
          </div>
          <p className="text-xl font-bold text-blue-950">
            {showRecordsLoading ? 'Loading...' : formatCurrency(tableValueTotal)}
          </p>
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
                  <tr key={record.id} className={getRejectedRowClass(record.status)}>
                    {showUserColumn ? (
                      <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>{record.user_name}</td>
                    ) : null}
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>
                      {formatEntryDate(record.entry_date)}
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`} title={record.narration}>
                      <span className="block max-w-[220px] truncate whitespace-nowrap lg:max-w-[300px]">
                        {getShortNarration(record.narration)}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status, 'strong')}`}>
                      {formatCurrency(record.expense_value)}
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>
                      {getLocationName(record)}
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>
                      {getCategoryName(record)}
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getExpenseStatusBadgeClass(record.status)}`}
                      >
                        {record.status}
                      </span>
                    </td>
                    <td className={`px-4 py-3 ${getExpenseRowTextClass(record.status)}`}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          const buttonRect = event.currentTarget.getBoundingClientRect()
                          const estimatedMenuHeight = currentUserRole === 'Admin' ? 220 : 144
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
                        className={getExpenseRowActionClass(record.status)}
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
            const canRecordApprove = canApproveRecord(record.status, currentUserRole, currentUserAdminAccess)
            const canRecordReject = canRejectRecord(record.status, currentUserRole, currentUserAdminAccess)
            const canRecordEdit = canEditRecord(record, currentUserRole, currentUserAdminAccess)
            const canRecordDelete = canDeleteRecord(record, currentUserRole, currentUserAdminAccess)

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
                className={`relative rounded-xl px-4 py-3 shadow ${
                  isRejectedStatus(record.status)
                    ? 'border border-red-200 bg-red-50'
                    : 'bg-white'
                }`}
              >
                <div className="space-y-2 pr-10">
                  <div className="flex items-center justify-between gap-2">
                    {currentUserRole === 'Admin' ? (
                      <p className={`truncate ${getExpenseRowTextClass(record.status, 'title')}`}>
                        {record.user_name}
                      </p>
                    ) : (
                      <p className={getExpenseRowTextClass(record.status, 'title')}>
                        {formatEntryDate(record.entry_date)}
                      </p>
                    )}
                    <span
                      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${getExpenseStatusBadgeClass(record.status)}`}
                    >
                      {record.status}
                    </span>
                  </div>
                  {currentUserRole === 'Admin' ? (
                    <p className={getExpenseRowTextClass(record.status, 'muted')}>
                      {formatEntryDate(record.entry_date)}
                    </p>
                  ) : null}
                  <p className={`truncate whitespace-nowrap ${getExpenseRowTextClass(record.status)}`}>
                    {getShortNarration(record.narration)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className={getExpenseRowTextClass(record.status, 'strong')}>
                      {formatCurrency(record.expense_value)}
                    </p>
                    <p className={`truncate ${getExpenseRowTextClass(record.status, 'muted')}`}>
                      {getLocationName(record)}
                    </p>
                  </div>
                  <p className={`truncate ${getExpenseRowTextClass(record.status, 'muted')}`}>
                    {getCategoryName(record)}
                  </p>
                </div>

                <div className="absolute right-2 top-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        setMobileActionMenuId((prev) => (prev === record.id ? null : record.id))
                      }}
                      className={getExpenseRowActionClass(record.status)}
                      aria-label="Open expense actions"
                    >
                      <MoreVertical className="h-5 w-5" />
                    </button>

                    {mobileActionMenuId === record.id ? (
                      <div
                        onClick={(event) => event.stopPropagation()}
                        className="absolute right-0 top-10 z-20 min-w-[140px] rounded-md border bg-white py-1 shadow-lg"
                      >
                        {canRecordApprove ? (
                          <button
                            type="button"
                            onClick={() => {
                              setApproveRecordId(record.id)
                              setMobileActionMenuId(null)
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50"
                          >
                            Approve
                          </button>
                        ) : null}
                        {canRecordReject ? (
                          <button
                            type="button"
                            onClick={() => {
                              setRejectRecordId(record.id)
                              setMobileActionMenuId(null)
                            }}
                            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Reject
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
                        <button
                          type="button"
                          onClick={() => openTimelineModal(record)}
                          className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
                        >
                          Timeline
                        </button>
                        {canRecordEdit ? (
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
                        {canRecordDelete ? (
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
            {canApproveRecord(
              selectedActionRecord?.status ?? 'Approved',
              currentUserRole,
              currentUserAdminAccess
            ) ? (
              <button
                type="button"
                onClick={() => {
                  if (!selectedActionRecord) return
                  setApproveRecordId(actionMenu.recordId)
                  setActionMenu(null)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-emerald-600 hover:bg-emerald-50"
              >
                Approve
              </button>
            ) : null}
            {canRejectRecord(
              selectedActionRecord?.status ?? 'Approved',
              currentUserRole,
              currentUserAdminAccess
            ) ? (
              <button
                type="button"
                onClick={() => {
                  if (!selectedActionRecord) return
                  setRejectRecordId(actionMenu.recordId)
                  setActionMenu(null)
                }}
                className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
              >
                Reject
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
            <button
              type="button"
              onClick={() => {
                if (!selectedActionRecord) return
                openTimelineModal(selectedActionRecord)
              }}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Timeline
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

      {timelineRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex max-h-[min(100dvh-0.5rem,760px)] w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[min(92dvh,760px)] sm:rounded-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">Timeline</h2>
                <p className="text-sm text-gray-500">Expense #{timelineRecordId}</p>
              </div>
              <button
                type="button"
                onClick={closeTimelineModal}
                className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close timeline modal"
              >
                X
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              {timelineError ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {timelineError}
                </div>
              ) : null}

              {isTimelineLoading ? (
                <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                  Loading timeline...
                </div>
              ) : timelineError ? null : timelineEntries.length === 0 ? (
                <div className="rounded-lg border border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
                  No timeline found for this record.
                </div>
              ) : (
                <div className="space-y-3">
                  {timelineEntries.map((entry) => (
                    <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{entry.action}</p>
                          <p className="text-xs text-gray-500">
                            User:{' '}
                            <span className="font-bold text-blue-700">
                              {entry.actor_name || entry.actor_email || 'Unknown user'}
                            </span>
                          </p>
                        </div>
                        <p className="text-xs font-medium text-gray-500">{formatDateTime(entry.created_at)}</p>
                      </div>
                      {getTimelineDetailEntries(entry.details).length > 0 ? (
                        <div className="mt-3 grid gap-2 border-t border-gray-100 pt-3 text-xs text-gray-600 sm:grid-cols-2">
                          {getTimelineDetailEntries(entry.details).map(([key, value]) => (
                            <div key={key} className="flex justify-between gap-3 rounded-md bg-gray-50 px-2 py-1">
                              <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                              <span className="text-right text-gray-800">{String(value)}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-xl min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingRecordId !== null
                  ? 'Edit Expense'
                  : isTransferEntryMode
                    ? 'Add Transfer'
                    : 'Add Expense'}
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

            <form onSubmit={handleAddOrUpdate} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              {formErrorMessage ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {formErrorMessage}
                </div>
              ) : null}

              {showAdvancedExpenseForm && editingRecordId === null ? (
                <div>
                  <p className="mb-2 block text-sm font-medium text-gray-700">Entry Type</p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="expense-entry-mode"
                        checked={entryMode === 'normal'}
                        onChange={() => {
                          setEntryMode('normal')
                          setFormErrorMessage(null)
                        }}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Normal Entry
                    </label>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="radio"
                        name="expense-entry-mode"
                        checked={entryMode === 'transfer'}
                        onChange={() => {
                          setEntryMode('transfer')
                          setFormErrorMessage(null)
                          if (selectedFormLocation && isHeadOfficeName(selectedFormLocation.shop_name)) {
                            setLocationId('')
                          }
                        }}
                        className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Transfer
                    </label>
                  </div>
                  {isTransferEntryMode ? (
                    <p className="mt-2 text-xs text-gray-500">
                      Amount will be deducted from {HEAD_OFFICE_SHOP_NAME} and added to the selected shop.
                    </p>
                  ) : null}
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
                <label htmlFor="expense-attachments" className="mb-1 block text-sm font-medium text-gray-700">
                  Attachments
                </label>
                <input
                  id="expense-attachments"
                  type="file"
                  multiple
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                />
                {existingAttachmentUrls.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {existingAttachmentUrls.map((url) => (
                      <div key={url} className="flex items-center justify-between gap-2">
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate text-xs text-blue-600 hover:underline"
                        >
                          {url.split('/').pop() ?? 'Attachment'}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setExistingAttachmentUrls((prev) => prev.filter((item) => item !== url))
                          }
                          className="text-xs font-semibold text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
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
                  <div ref={locationDropdownRef} className="relative min-w-0">
                    <p className="mb-1 block text-sm font-medium text-gray-700">
                      {isTransferEntryMode ? 'Transfer To Shop' : 'Location'}
                    </p>
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
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 w-full max-w-full overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg sm:w-[230px] sm:max-w-none">
                        <input
                          type="text"
                          value={locationSearchTerm}
                          onChange={(event) => setLocationSearchTerm(event.target.value)}
                          placeholder="Search location..."
                          className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        {formLocationOptions.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-gray-500">
                            {isTransferEntryMode ? 'No shop found.' : 'No location found.'}
                          </p>
                        ) : (
                          formLocationOptions.map((location) => (
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
                      <p className="mt-1 text-xs font-medium text-red-600">
                        {isTransferEntryMode
                          ? 'Please select a shop other than Head Office.'
                          : 'Location is required.'}
                      </p>
                    ) : null}
                    {!isTransferEntryMode &&
                    showAdvancedExpenseForm &&
                    selectedFormLocation &&
                    isHeadOfficeName(selectedFormLocation.shop_name) ? (
                      <p className="mt-1 text-xs text-emerald-700">
                        This entry will be saved as Approved for {HEAD_OFFICE_SHOP_NAME}.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div ref={categoryDropdownRef} className="relative min-w-0">
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
                    <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 w-full max-w-full overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg sm:w-[230px] sm:max-w-none">
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

              </div>

              <div className="flex shrink-0 flex-col-reverse gap-2 border-t bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5">
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
                  {isSaving
                    ? 'Saving...'
                    : editingRecordId !== null
                      ? 'Update Expense'
                      : isTransferEntryMode
                        ? 'Save Transfer'
                        : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="shrink-0 border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Expense</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this expense? This action cannot be undone.
              </p>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5">
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
      ) : null}

      {rejectRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="shrink-0 border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Reject Expense</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to reject this expense?
              </p>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5">
              <button
                type="button"
                onClick={() => setRejectRecordId(null)}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRejectConfirm}
                disabled={isSaving}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                {isSaving ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {approveRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="shrink-0 border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Approve Expense</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve this expense?
              </p>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5">
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
      ) : null}

      {isApproveAllConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="shrink-0 border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Approve All Expenses</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve all visible pending expenses?
              </p>
              <p className="mt-2 text-sm font-semibold text-emerald-700">
                {visiblePendingApprovalCount} pending record(s) will be approved.
              </p>
            </div>
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end md:px-5">
              <button
                type="button"
                onClick={() => setIsApproveAllConfirmOpen(false)}
                disabled={isApprovingAll}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApproveAllVisible}
                disabled={isApprovingAll}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isApprovingAll ? 'Approving...' : 'Approve All'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedViewRecord ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-xl">
            <div className="flex shrink-0 items-center justify-between border-b px-4 py-3 md:px-5">
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
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">

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
                  className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getExpenseStatusBadgeClass(selectedViewRecord.status)}`}
                >
                  {selectedViewRecord.status}
                </span>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Attachments</p>
                {selectedViewRecord.attachment_urls.length > 0 ? (
                  <div className="mt-2 space-y-1">
                    {selectedViewRecord.attachment_urls.map((url) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm text-blue-600 hover:underline"
                      >
                        {url.split('/').pop() ?? 'Attachment'}
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-800">No attachments.</p>
                )}
              </div>
            </div>
            <div className="flex shrink-0 justify-end border-t px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:px-5">
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
      ) : null}

    </div>
  )
}
