'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadAttachmentToCloudinary } from '@/lib/cloudinary-upload'
import { CheckCircle, ChevronDown, MoreVertical, SlidersHorizontal } from 'lucide-react'

type CashRecordStatus = 'Pending' | 'Approved'
type UserRole = 'Admin' | 'Managment' | 'Viewer'
type AdminAccess = 'All Access' | 'Edit and Delete' | 'Approvals Only'

interface LocationOption {
  id: number
  shop_name: string
}

interface CashRecordLocationRelation {
  id: number
  shop_name: string
}

interface CashRecord {
  id: number
  user_name: string
  entry_date: string
  narration: string
  cash_value: number
  location_id: number
  status: CashRecordStatus
  attachment_urls: string[]
  locations: CashRecordLocationRelation | CashRecordLocationRelation[] | null
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

interface CashRecordsRpcResponse {
  total_count: number
  total_value: number
  records: CashRecord[]
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
  status: CashRecordStatus,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => role === 'Admin' && status === 'Pending' && (adminAccess === 'All Access' || adminAccess === 'Approvals Only')

const canEditRecord = (
  record: CashRecord,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => {
  if (role === 'Admin') {
    if (adminAccess === 'Approvals Only') return false
    if (adminAccess === 'Edit and Delete') return record.status === 'Pending'
    return true
  }

  return record.status !== 'Approved'
}

const canDeleteRecord = (
  record: CashRecord,
  role: UserRole | null,
  adminAccess: AdminAccess | null
) => canEditRecord(record, role, adminAccess)

let cashRecordsPageCache: {
  hydrated: boolean
  currentUserName: string
  currentUserId: number | null
  currentUserRole: UserRole | null
  currentUserAdminAccess: AdminAccess | null
  userOptions: string[]
  locations: LocationOption[]
  records: CashRecord[]
  totalCount: number
  tableValueTotal: number
  currentPage: number
  currentUserContext: CurrentUserContext | null
  currentUserEmail: string
} = {
  hydrated: false,
  currentUserName: '',
  currentUserId: null,
  currentUserRole: null,
  currentUserAdminAccess: null,
  userOptions: [],
  locations: [],
  records: [],
  totalCount: 0,
  tableValueTotal: 0,
  currentPage: 1,
  currentUserContext: null,
  currentUserEmail: '',
}

export default function CashRecordsPage() {
  const getTodayDateInputValue = () => new Date().toISOString().split('T')[0] ?? ''
  const ITEMS_PER_PAGE = 25

  const [userName, setUserName] = useState('')
  const [entryDate, setEntryDate] = useState(getTodayDateInputValue())
  const [narration, setNarration] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [existingAttachmentUrls, setExistingAttachmentUrls] = useState<string[]>([])
  const [cashValue, setCashValue] = useState('')
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
  const [filterStatus, setFilterStatus] = useState<CashRecordStatus | ''>('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [locationSearchTerm, setLocationSearchTerm] = useState('')
  const [isLocationDropdownOpen, setIsLocationDropdownOpen] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserId, setCurrentUserId] = useState<number | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [currentUserAdminAccess, setCurrentUserAdminAccess] = useState<AdminAccess | null>(null)
  const [userOptions, setUserOptions] = useState<string[]>([])
  const [records, setRecords] = useState<CashRecord[]>([])
  const [tableValueTotal, setTableValueTotal] = useState(0)
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null)
  const [approveRecordId, setApproveRecordId] = useState<number | null>(null)
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
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [currentUserContext, setCurrentUserContext] = useState<CurrentUserContext | null>(null)
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  const hasFetchedOnceRef = useRef(false)
  const filterPopoverRef = useRef<HTMLDivElement | null>(null)
  const locationDropdownRef = useRef<HTMLDivElement | null>(null)

  const getCurrentUserEmail = () => {
    const emailCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_email='))

    return emailCookie
      ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_email') ?? '')
  }

  const fetchAllowedLocations = async (): Promise<CurrentUserContext | null> => {
    const currentEmail = getCurrentUserEmail()
    if (!currentEmail) {
      setLocations([])
      setCurrentUserId(null)
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
      setCurrentUserId(null)
      setCurrentUserRole(null)
      setCurrentUserAdminAccess(null)
      setCurrentUserName('')
      return null
    }

    setCurrentUserId(currentUser.id)
    setCurrentUserRole(currentUser.role)
    setCurrentUserAdminAccess(currentUser.admin_access)
    setCurrentUserName(currentUser.user_name)

    // Admin can use all locations.
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

  const fetchCashRecords = async (
    page = 1,
    searchValue = '',
    selectedUserName = '',
    selectedLocationId: number | '' = '',
    selectedStatus: CashRecordStatus | '' = '',
    selectedDateFrom = '',
    selectedDateTo = ''
  ) => {
    if (!currentUserEmail) {
      setRecords([])
      setTotalCount(0)
      setTableValueTotal(0)
      return
    }

    const { data, error } = await supabase.rpc('get_cash_records_page_data', {
      p_user_email: currentUserEmail,
      p_page: page,
      p_page_size: ITEMS_PER_PAGE,
      p_search: searchValue.trim(),
      p_filter_user_name: selectedUserName.trim(),
      p_filter_location_id: selectedLocationId || null,
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

    const rpcPayload = (data ?? {}) as Partial<CashRecordsRpcResponse>
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
        : nextRecords.reduce((total, record) => total + Number(record.cash_value || 0), 0)
    )
  }

  const loadPageData = async (silent = false) => {
    if (!silent) setIsLoading(true)
    setErrorMessage(null)
    const currentUser = await fetchAllowedLocations()
    setCurrentUserContext(currentUser)
    if (!silent) setIsLoading(false)
  }

  useEffect(() => {
    if (hasFetchedOnceRef.current) return
    hasFetchedOnceRef.current = true
    if (cashRecordsPageCache.hydrated) {
      setCurrentUserName(cashRecordsPageCache.currentUserName)
      setCurrentUserId(cashRecordsPageCache.currentUserId)
      setCurrentUserRole(cashRecordsPageCache.currentUserRole)
      setCurrentUserAdminAccess(cashRecordsPageCache.currentUserAdminAccess)
      setUserOptions(cashRecordsPageCache.userOptions)
      setLocations(cashRecordsPageCache.locations)
      setRecords(cashRecordsPageCache.records)
      setTotalCount(cashRecordsPageCache.totalCount)
      setTableValueTotal(cashRecordsPageCache.tableValueTotal)
      setCurrentPage(cashRecordsPageCache.currentPage)
      setCurrentUserContext(cashRecordsPageCache.currentUserContext)
      setCurrentUserEmail(cashRecordsPageCache.currentUserEmail)
      setIsLoading(false)
      loadPageData(true)
      return
    }

    loadPageData(false)
  }, [])

  useEffect(() => {
    cashRecordsPageCache = {
      hydrated: Boolean(currentUserEmail || records.length > 0),
      currentUserName,
      currentUserId,
      currentUserRole,
      currentUserAdminAccess,
      userOptions,
      locations,
      records,
      totalCount,
      tableValueTotal,
      currentPage,
      currentUserContext,
      currentUserEmail,
    }
  }, [
    currentUserName,
    currentUserId,
    currentUserRole,
    currentUserAdminAccess,
    userOptions,
    locations,
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
  }, [debouncedSearchTerm, filterUserName, filterLocationId, filterStatus, filterDateFrom, filterDateTo])

  useEffect(() => {
    if (!hasFetchedOnceRef.current || !currentUserContext) return

    const loadRecords = async () => {
      setIsRecordsLoading(true)
      await fetchCashRecords(
        currentPage,
        debouncedSearchTerm,
        filterUserName,
        filterLocationId,
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
    filterStatus,
    filterDateFrom,
    filterDateTo,
  ])

  const refreshCurrentPage = async () => {
    if (!currentUserContext) return
    await fetchCashRecords(
      currentPage,
      debouncedSearchTerm,
      filterUserName,
      filterLocationId,
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
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const resetForm = () => {
    setUserName(currentUserRole === 'Admin' ? '' : currentUserName)
    setEntryDate(getTodayDateInputValue())
    setNarration('')
    setCashValue('')
    setSelectedFiles([])
    setExistingAttachmentUrls([])
    setLocationId('')
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
    setShowValidation(false)
  }

  const closeFormModal = () => {
    setIsModalOpen(false)
    setEditingRecordId(null)
    resetForm()
  }

  const openAddModal = () => {
    setEditingRecordId(null)
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (record: CashRecord) => {
    setEditingRecordId(record.id)
    setUserName(record.user_name)
    setEntryDate(record.entry_date ?? getTodayDateInputValue())
    setNarration(record.narration)
    setCashValue(record.cash_value.toString())
    setSelectedFiles([])
    setExistingAttachmentUrls(record.attachment_urls ?? [])
    setLocationId(record.location_id)
    setLocationSearchTerm('')
    setIsLocationDropdownOpen(false)
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
      entry_type: 'cash_record',
      entry_id: recordId,
      action,
      actor_name: actorName,
      actor_email: actorEmail || null,
      details,
    })
  }

  const openTimelineModal = async (record: CashRecord) => {
    setTimelineRecordId(record.id)
    setTimelineEntries([])
    setTimelineError(null)
    setIsTimelineLoading(true)
    setActionMenu(null)
    setMobileActionMenuId(null)

    const { data, error } = await supabase.rpc('get_entry_timeline', {
      p_entry_type: 'cash_record',
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
    const numericCashValue = Number(cashValue)

    if (
      !effectiveUserName ||
      !entryDate ||
      !trimmedNarration ||
      !locationId ||
      !cashValue ||
      Number.isNaN(numericCashValue) ||
      numericCashValue <= 0
    ) {
      setShowValidation(true)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const uploadAttachments = async (recordId: number) => {
      if (selectedFiles.length === 0) return []

      const uploadedUrls: string[] = []

      for (const file of selectedFiles) {
        const url = await uploadAttachmentToCloudinary(file, `cash-records/${recordId}`)
        uploadedUrls.push(url)
      }

      return uploadedUrls
    }

    if (editingRecordId !== null) {
      const editingRecord = records.find((record) => record.id === editingRecordId)
      if (!editingRecord) {
        setErrorMessage('Cash record not found.')
        setIsSaving(false)
        return
      }
      if (!canEditRecord(editingRecord, currentUserRole, currentUserAdminAccess)) {
        setErrorMessage('You do not have access to edit this cash record.')
        setIsSaving(false)
        setIsModalOpen(false)
        return
      }

      const { data, error } = await supabase
        .from('cash_records')
        .update({
          user_name: effectiveUserName,
          entry_date: entryDate,
          narration: trimmedNarration,
          cash_value: numericCashValue,
          location_id: locationId,
          attachment_urls: existingAttachmentUrls,
        })
        .eq('id', editingRecordId)
        .select(
          'id, user_name, entry_date, narration, cash_value, location_id, status, locations(id, shop_name)'
        )
        .single()

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      try {
        const uploadedUrls = await uploadAttachments(editingRecordId)
        const mergedAttachmentUrls = [...existingAttachmentUrls, ...uploadedUrls]

        if (uploadedUrls.length > 0) {
          const { data: updatedRecord, error: attachmentUpdateError } = await supabase
            .from('cash_records')
            .update({ attachment_urls: mergedAttachmentUrls })
            .eq('id', editingRecordId)
            .select(
              'id, user_name, entry_date, narration, cash_value, location_id, status, attachment_urls, locations(id, shop_name)'
            )
            .single()

          if (attachmentUpdateError) {
            setErrorMessage(attachmentUpdateError.message)
            setIsSaving(false)
            return
          }

          setRecords((prev) =>
            prev.map((record) => (record.id === editingRecordId ? (updatedRecord as CashRecord) : record))
          )
        } else {
          setRecords((prev) =>
            prev.map((record) =>
              record.id === editingRecordId
                ? {
                    ...(data as CashRecord),
                    attachment_urls: existingAttachmentUrls,
                  }
                : record
            )
          )
        }
      } catch (uploadError) {
        setErrorMessage(uploadError instanceof Error ? uploadError.message : 'File upload failed.')
        setIsSaving(false)
        return
      }

      await recordTimeline(editingRecordId, 'Updated').catch(() => undefined)
    } else {
      const { data, error } = await supabase
        .from('cash_records')
        .insert({
          user_name: effectiveUserName,
          entry_date: entryDate,
          narration: trimmedNarration,
          cash_value: numericCashValue,
          location_id: locationId,
          status: 'Pending',
          attachment_urls: [],
        })
        .select(
          'id, user_name, entry_date, narration, cash_value, location_id, status, attachment_urls, locations(id, shop_name)'
        )
        .single()

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      try {
        const insertedRecordId = (data as CashRecord).id
        const uploadedUrls = await uploadAttachments(insertedRecordId)

        if (uploadedUrls.length > 0) {
          const { error: attachmentUpdateError } = await supabase
            .from('cash_records')
            .update({ attachment_urls: uploadedUrls })
            .eq('id', insertedRecordId)

          if (attachmentUpdateError) {
            setErrorMessage(attachmentUpdateError.message)
            setIsSaving(false)
            return
          }
        }
      } catch (uploadError) {
        setErrorMessage(uploadError instanceof Error ? uploadError.message : 'File upload failed.')
        setIsSaving(false)
        return
      }

      await recordTimeline((data as CashRecord).id, 'Added').catch(() => undefined)

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
      setErrorMessage('Cash record not found.')
      setDeleteRecordId(null)
      setIsDeleting(false)
      return
    }
    if (!canDeleteRecord(targetRecord, currentUserRole, currentUserAdminAccess)) {
      setErrorMessage('You do not have access to delete this cash record.')
      setDeleteRecordId(null)
      setIsDeleting(false)
      return
    }

    const deletedRecordId = deleteRecordId
    const { error } = await supabase.from('cash_records').delete().eq('id', deletedRecordId)

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
      setErrorMessage('You do not have access to approve this cash record.')
      setApproveRecordId(null)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('cash_records')
      .update({ status: 'Approved' })
      .eq('id', approveRecordId)
      .select(
        'id, user_name, entry_date, narration, cash_value, location_id, status, attachment_urls, locations(id, shop_name)'
      )
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    await recordTimeline(approveRecordId, 'Approved').catch(() => undefined)
    setRecords((prev) => prev.map((record) => (record.id === approveRecordId ? (data as CashRecord) : record)))
    setApproveRecordId(null)
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
    const { error } = await supabase.from('cash_records').update({ status: 'Approved' }).in('id', recordIds)

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

  const getLocationName = (record: CashRecord) => {
    const locationRecord = Array.isArray(record.locations) ? record.locations[0] : record.locations
    return locationRecord?.shop_name ?? '-'
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
  const isCashValueInvalid =
    showValidation && (!cashValue || Number.isNaN(Number(cashValue)) || Number(cashValue) <= 0)
  const isLocationInvalid = showValidation && !locationId
  const normalizedLocationSearch = locationSearchTerm.trim().toLowerCase()
  const filteredLocationOptions =
    normalizedLocationSearch.length === 0
      ? locations
      : locations.filter((location) =>
          location.shop_name.toLowerCase().includes(normalizedLocationSearch)
        )
  const selectedLocationLabel =
    locations.find((location) => location.id === locationId)?.shop_name ?? 'Select location'
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
  const canApprove = (status: CashRecordStatus) =>
    canApproveRecord(status, currentUserRole, currentUserAdminAccess)
  const visiblePendingApprovalCount = records.filter((record) =>
    canApproveRecord(record.status, currentUserRole, currentUserAdminAccess)
  ).length

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 space-y-3 md:flex md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center justify-between md:block">
          <h1 className="text-2xl font-bold text-gray-800">Cash Records</h1>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 md:hidden"
          >
            Add Cash
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
            title="Approve all visible pending cash records"
          >
            <CheckCircle className="h-4 w-4" />
            <span>{isApprovingAll ? 'Approving...' : 'Approve All'}</span>
          </button>

          <div className="relative w-full sm:w-64">
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search cash records..."
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
            Add Cash
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
                    Status
                  </label>
                  <select
                    value={filterStatus}
                    onChange={(event) => setFilterStatus(event.target.value as CashRecordStatus | '')}
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
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {showRecordsLoading ? (
                <tr>
                  <td colSpan={showUserColumn ? 7 : 6} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading cash records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={showUserColumn ? 7 : 6} className="px-4 py-6 text-center text-sm text-gray-500">
                    No cash records found.
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
                      <span className="block max-w-[260px] truncate whitespace-nowrap lg:max-w-[340px]">
                        {getShortNarration(record.narration)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-800">
                      {formatCurrency(record.cash_value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{getLocationName(record)}</td>
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
                      <div className="relative">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            const buttonRect = event.currentTarget.getBoundingClientRect()
                            const estimatedMenuHeight = currentUserRole === 'Admin' ? 180 : 144
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
                          aria-label="Open cash record actions"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </button>
                      </div>
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
            Loading cash records...
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            No cash records found.
          </div>
        ) : (
          records.map((record) => {
            const canRecordApprove = canApprove(record.status)
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
                className="relative rounded-xl bg-white px-4 py-3 shadow"
              >
                <div className="space-y-2 pr-10">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {currentUserRole === 'Admin' ? (
                        <>
                          <p className="truncate text-sm font-semibold text-gray-900">{record.user_name}</p>
                          <p className="text-xs text-gray-500">{formatEntryDate(record.entry_date)}</p>
                        </>
                      ) : (
                        <p className="text-sm font-semibold text-gray-900">{formatEntryDate(record.entry_date)}</p>
                      )}
                    </div>
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
                  <p className="truncate whitespace-nowrap text-sm text-gray-700">
                    {getShortNarration(record.narration)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-gray-800">
                      Value: {formatCurrency(record.cash_value)}
                    </p>
                    <p className="truncate text-xs text-gray-500">{getLocationName(record)}</p>
                  </div>
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
                      aria-label="Open cash record actions"
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
            {canApprove(selectedActionRecord?.status ?? 'Approved') ? (
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
                <p className="text-sm text-gray-500">Cash Record #{timelineRecordId}</p>
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
                {editingRecordId !== null ? 'Edit Cash Record' : 'Add Cash Record'}
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

            <form
              onSubmit={handleAddOrUpdate}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <div>
                <label htmlFor="cash-user-name" className="mb-1 block text-sm font-medium text-gray-700">
                  User Name
                </label>
                {currentUserRole === 'Admin' ? (
                  <select
                    id="cash-user-name"
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
                    id="cash-user-name"
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
                <label htmlFor="cash-attachments" className="mb-1 block text-sm font-medium text-gray-700">
                  Attachments
                </label>
                <input
                  id="cash-attachments"
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
                <label htmlFor="cash-entry-date" className="mb-1 block text-sm font-medium text-gray-700">
                  Entry Date
                </label>
                <input
                  id="cash-entry-date"
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
                <label htmlFor="cash-narration" className="mb-1 block text-sm font-medium text-gray-700">
                  Narration
                </label>
                <textarea
                  id="cash-narration"
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
                <label htmlFor="cash-value" className="mb-1 block text-sm font-medium text-gray-700">
                  Value (Rs.)
                </label>
                <input
                  id="cash-value"
                  type="number"
                  min="0"
                  step="0.01"
                  value={cashValue}
                  onChange={(event) => setCashValue(event.target.value)}
                  placeholder="Enter amount in Rs."
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isCashValueInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isCashValueInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Value must be greater than 0.</p>
                ) : null}
              </div>

              <div ref={locationDropdownRef} className="relative min-w-0">
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
                  <div className="absolute left-0 right-0 z-20 mt-1 max-h-52 w-full max-w-full overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg sm:w-[420px] sm:max-w-none">
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
                {locations.length === 0 ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    No allowed locations found for this user.
                  </p>
                ) : null}
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
                      ? 'Update Cash Record'
                      : 'Save Cash Record'}
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
              <h2 className="text-lg font-semibold text-gray-800">Delete Cash Record</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this cash record? This action cannot be undone.
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

      {approveRecordId !== null ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-4">
          <div className="flex w-full max-w-md min-w-0 max-h-[min(calc(100dvh-1rem),92dvh)] flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl">
            <div className="shrink-0 border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Approve Cash Record</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve this cash record?
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
              <h2 className="text-lg font-semibold text-gray-800">Approve All Cash Records</h2>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 md:px-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve all visible pending cash records?
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
              <h2 className="text-lg font-semibold text-gray-800">Cash Record Details</h2>
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
                <p className="mt-1 text-sm text-gray-800">{formatCurrency(selectedViewRecord.cash_value)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Location</p>
                <p className="mt-1 text-sm text-gray-800">{getLocationName(selectedViewRecord)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
                <p className="mt-1 text-sm text-gray-800">{selectedViewRecord.status}</p>
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
