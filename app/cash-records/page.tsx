'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

type CashRecordStatus = 'Pending' | 'Approved'
type UserRole = 'Admin' | 'Managment' | 'Viewer'

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
  narration: string
  location_id: number
  status: CashRecordStatus
  locations: CashRecordLocationRelation | CashRecordLocationRelation[] | null
}

interface UserLocationRow {
  location_id: number
}

interface UserOption {
  user_name: string
}

export default function CashRecordsPage() {
  const [userName, setUserName] = useState('')
  const [narration, setNarration] = useState('')
  const [locationId, setLocationId] = useState<number | ''>('')
  const [status, setStatus] = useState<CashRecordStatus>('Pending')
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null)
  const [userOptions, setUserOptions] = useState<string[]>([])
  const [records, setRecords] = useState<CashRecord[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null)
  const [deleteRecordId, setDeleteRecordId] = useState<number | null>(null)
  const [approveRecordId, setApproveRecordId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showValidation, setShowValidation] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const hasFetchedOnceRef = useRef(false)

  const getCurrentUserEmail = () => {
    const emailCookie = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('rms_user_email='))

    return emailCookie
      ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
      : (localStorage.getItem('rms_user_email') ?? '')
  }

  const fetchAllowedLocations = async () => {
    const currentEmail = getCurrentUserEmail()
    if (!currentEmail) {
      setLocations([])
      return
    }

    const { data: currentUser, error: currentUserError } = await supabase
      .from('users')
      .select('id, role, user_name')
      .eq('user_email', currentEmail)
      .single<{ id: number; role: UserRole; user_name: string }>()

    if (currentUserError || !currentUser) {
      setErrorMessage(currentUserError?.message ?? 'User not found.')
      setLocations([])
      setUserOptions([])
      return
    }

    setCurrentUserRole(currentUser.role)
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
        return
      }

      setLocations((data as LocationOption[]) ?? [])

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('user_name')
        .order('user_name', { ascending: true })

      if (usersError) {
        setErrorMessage(usersError.message)
        setUserOptions([])
        return
      }

      const uniqueNames = Array.from(
        new Set(
          ((usersData as UserOption[]) ?? [])
            .map((user) => user.user_name.trim())
            .filter((name) => name.length > 0)
        )
      )
      setUserOptions(uniqueNames)
      return
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
      return
    }

    const assignedLocationIds = ((mappingRows as UserLocationRow[]) ?? []).map((row) => row.location_id)

    if (assignedLocationIds.length === 0) {
      setLocations([])
      return
    }

    const { data, error } = await supabase
      .from('locations')
      .select('id, shop_name')
      .in('id', assignedLocationIds)
      .order('shop_name', { ascending: true })

    if (error) {
      setErrorMessage(error.message)
      setLocations([])
      return
    }

    setLocations((data as LocationOption[]) ?? [])
  }

  const fetchCashRecords = async () => {
    const { data, error } = await supabase
      .from('cash_records')
      .select('id, user_name, narration, location_id, status, locations(id, shop_name)')
      .order('id', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setRecords([])
      return
    }

    setRecords((data as CashRecord[]) ?? [])
  }

  const loadPageData = async () => {
    setIsLoading(true)
    setErrorMessage(null)
    await fetchAllowedLocations()
    await fetchCashRecords()
    setIsLoading(false)
  }

  useEffect(() => {
    if (hasFetchedOnceRef.current) return
    hasFetchedOnceRef.current = true
    loadPageData()
  }, [])

  const resetForm = () => {
    setUserName(currentUserRole === 'Admin' ? '' : currentUserName)
    setNarration('')
    setLocationId('')
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
    setNarration(record.narration)
    setLocationId(record.location_id)
    setShowValidation(false)
    setIsModalOpen(true)
  }

  const handleAddOrUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedUserName = userName.trim()
    const effectiveUserName =
      currentUserRole === 'Admin' ? trimmedUserName : currentUserName.trim() || trimmedUserName
    const trimmedNarration = narration.trim()

    if (!effectiveUserName || !trimmedNarration || !locationId) {
      setShowValidation(true)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    if (editingRecordId !== null) {
      const { data, error } = await supabase
        .from('cash_records')
        .update({
          user_name: effectiveUserName,
          narration: trimmedNarration,
          location_id: locationId,
        })
        .eq('id', editingRecordId)
        .select('id, user_name, narration, location_id, status, locations(id, shop_name)')
        .single()

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      setRecords((prev) => prev.map((record) => (record.id === editingRecordId ? (data as CashRecord) : record)))
    } else {
      const { data, error } = await supabase
        .from('cash_records')
        .insert({
          user_name: effectiveUserName,
          narration: trimmedNarration,
          location_id: locationId,
          status: 'Pending',
        })
        .select('id, user_name, narration, location_id, status, locations(id, shop_name)')
        .single()

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }

      setRecords((prev) => [data as CashRecord, ...prev])
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

    const { error } = await supabase.from('cash_records').delete().eq('id', deleteRecordId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    setRecords((prev) => prev.filter((record) => record.id !== deleteRecordId))
    setDeleteRecordId(null)
    setIsDeleting(false)
  }

  const handleApproveConfirm = async () => {
    if (approveRecordId === null) return
    if (currentUserRole !== 'Admin') {
      setErrorMessage('Only Admin can approve cash records.')
      setApproveRecordId(null)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('cash_records')
      .update({ status: 'Approved' })
      .eq('id', approveRecordId)
      .select('id, user_name, narration, location_id, status, locations(id, shop_name)')
      .single()

    if (error) {
      setErrorMessage(error.message)
      setIsSaving(false)
      return
    }

    setRecords((prev) => prev.map((record) => (record.id === approveRecordId ? (data as CashRecord) : record)))
    setApproveRecordId(null)
    setIsSaving(false)
  }

  const getLocationName = (record: CashRecord) => {
    const locationRecord = Array.isArray(record.locations) ? record.locations[0] : record.locations
    return locationRecord?.shop_name ?? '-'
  }

  const isUserNameInvalid = showValidation && userName.trim().length === 0
  const isNarrationInvalid = showValidation && narration.trim().length === 0
  const isLocationInvalid = showValidation && !locationId

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Cash Records</h1>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Add Cash Record
        </button>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">User Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Narration</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Location</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading cash records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">
                    No cash records added yet.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id} className="border-t">
                    <td className="px-4 py-3 text-sm text-gray-700">{record.user_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.narration}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{getLocationName(record)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{record.status}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
                        {currentUserRole === 'Admin' ? (
                          <button
                            type="button"
                            onClick={() => setApproveRecordId(record.id)}
                            disabled={record.status === 'Approved'}
                            className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                              record.status === 'Approved'
                                ? 'cursor-not-allowed border-emerald-200 text-emerald-300'
                                : 'border-emerald-600 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
                            Approve
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditModal(record)}
                          className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteRecordId(record.id)}
                          className="rounded-md border border-red-600 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          Delete
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

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
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

            <form onSubmit={handleAddOrUpdate} className="space-y-4 px-4 py-4 md:px-5 md:py-5">
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
                <label htmlFor="cash-location" className="mb-1 block text-sm font-medium text-gray-700">
                  Location
                </label>
                <select
                  id="cash-location"
                  value={locationId}
                  onChange={(event) => setLocationId(event.target.value ? Number(event.target.value) : '')}
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-1 ${
                    isLocationInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                >
                  <option value="">Select location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.shop_name}
                    </option>
                  ))}
                </select>
                {isLocationInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Location is required.</p>
                ) : null}
                {locations.length === 0 ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    No allowed locations found for this user.
                  </p>
                ) : null}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Cash Record</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this cash record? This action cannot be undone.
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
              <h2 className="text-lg font-semibold text-gray-800">Approve Cash Record</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to approve this cash record?
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
    </div>
  )
}
