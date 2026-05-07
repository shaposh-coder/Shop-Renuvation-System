'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronDown, Eye, EyeOff, MoreVertical } from 'lucide-react'
import { sha256 } from 'js-sha256'

type UserStatus = 'Active' | 'In-active'
type UserRole = 'Admin' | 'Managment' | 'Viewer'

interface UserRecord {
  id: number
  user_name: string
  user_email: string
  status: UserStatus
  role: UserRole
  location_ids: number[]
  location_names: string[]
}

interface LocationOption {
  id: number
  shop_name: string
}

interface UsersPageRpcResponse {
  users: UserRecord[]
  locations: LocationOption[]
}

export default function SettingsUsersPage() {
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [status, setStatus] = useState<UserStatus>('Active')
  const [role, setRole] = useState<UserRole>('Viewer')
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [locations, setLocations] = useState<LocationOption[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<number | null>(null)
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isLocationsDropdownOpen, setIsLocationsDropdownOpen] = useState(false)
  const [locationSearchTerm, setLocationSearchTerm] = useState('')
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null)
  const [selectedUser, setSelectedUser] = useState<UserRecord | null>(null)
  const [locationsPopupUser, setLocationsPopupUser] = useState<UserRecord | null>(null)
  const hasFetchedOnceRef = useRef(false)
  const locationsDropdownRef = useRef<HTMLDivElement | null>(null)

  const fetchUsersAndLocations = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const { data, error } = await supabase.rpc('get_users_page_data')

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    const rpcPayload = (data ?? {}) as Partial<UsersPageRpcResponse>
    const rpcUsers = Array.isArray(rpcPayload.users) ? rpcPayload.users : []
    const rpcLocations = Array.isArray(rpcPayload.locations) ? rpcPayload.locations : []

    setUsers(
      rpcUsers.map((user) => ({
        ...user,
        location_ids: user.location_ids ?? [],
        location_names: user.location_names ?? [],
      }))
    )
    setLocations(rpcLocations)
    setIsLoading(false)
  }

  useEffect(() => {
    if (hasFetchedOnceRef.current) return
    hasFetchedOnceRef.current = true
    fetchUsersAndLocations()
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        locationsDropdownRef.current &&
        !locationsDropdownRef.current.contains(event.target as Node)
      ) {
        setIsLocationsDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const resetForm = () => {
    setUserName('')
    setUserEmail('')
    setUserPassword('')
    setStatus('Active')
    setRole('Viewer')
    setSelectedLocationIds([])
    setIsPasswordVisible(false)
    setShowValidation(false)
  }

  const closeFormModal = () => {
    setIsModalOpen(false)
    setEditingUserId(null)
    setIsLocationsDropdownOpen(false)
    setLocationSearchTerm('')
    resetForm()
  }

  const openAddModal = () => {
    setEditingUserId(null)
    resetForm()
    setIsModalOpen(true)
  }

  const openEditModal = (user: UserRecord) => {
    setOpenActionMenuId(null)
    setEditingUserId(user.id)
    setUserName(user.user_name)
    setUserEmail(user.user_email)
    setUserPassword('')
    setStatus(user.status)
    setRole(user.role)
    setSelectedLocationIds(user.location_ids)
    setShowValidation(false)
    setIsLocationsDropdownOpen(false)
    setLocationSearchTerm('')
    setIsModalOpen(true)
  }

  const openEditFromDetails = () => {
    if (!selectedUser) return
    const userToEdit = selectedUser
    setSelectedUser(null)
    openEditModal(userToEdit)
  }

  const openDeleteFromDetails = () => {
    if (!selectedUser) return
    setDeleteUserId(selectedUser.id)
    setSelectedUser(null)
  }

  const toggleLocationSelection = (locationId: number) => {
    setSelectedLocationIds((prev) =>
      prev.includes(locationId) ? prev.filter((id) => id !== locationId) : [...prev, locationId]
    )
  }

  const normalizedLocationSearch = locationSearchTerm.trim().toLowerCase()
  const isLocationsSelectionDisabled = role === 'Admin'
  const filteredLocations =
    normalizedLocationSearch.length === 0
      ? locations
      : locations.filter((location) =>
          location.shop_name.toLowerCase().includes(normalizedLocationSearch)
        )

  const saveUserLocations = async (userId: number, locationIds: number[]) => {
    const { error: deleteError } = await supabase.from('user_locations').delete().eq('user_id', userId)
    if (deleteError) return deleteError

    if (locationIds.length === 0) return null

    const payload = locationIds.map((locationId) => ({ user_id: userId, location_id: locationId }))
    const { error: insertError } = await supabase.from('user_locations').insert(payload)
    return insertError ?? null
  }

  const handleAddOrUpdateUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = userName.trim()
    const trimmedEmail = userEmail.trim()
    const trimmedPassword = userPassword.trim()

    if (!trimmedName || !trimmedEmail || (editingUserId === null && !trimmedPassword)) {
      setShowValidation(true)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)
    const effectiveLocationIds = role === 'Admin' ? [] : selectedLocationIds

    if (editingUserId !== null) {
      const updatePayload: {
        user_name: string
        user_email: string
        status: UserStatus
        role: UserRole
        user_password?: string
      } = {
        user_name: trimmedName,
        user_email: trimmedEmail,
        status,
        role,
      }
      if (trimmedPassword) {
        updatePayload.user_password = sha256(trimmedPassword)
      }

      const { data, error } = await supabase
            .from('users')
        .update(updatePayload)
            .eq('id', editingUserId)
        .select('id, user_name, user_email, status, role')
        .single()

      if (error) {
        setErrorMessage(
          error.code === '23505' ? 'User email already exists. Please use a different email.' : error.message
        )
        setIsSaving(false)
            return
          }

      const mappingError = await saveUserLocations(editingUserId, effectiveLocationIds)
      if (mappingError) {
        setErrorMessage(mappingError.message)
        setIsSaving(false)
        return
      }

      const selectedLocationNames = locations
        .filter((location) => effectiveLocationIds.includes(location.id))
        .map((location) => location.shop_name)

      setUsers((prev) =>
        prev.map((user) =>
          user.id === editingUserId
            ? {
                ...(data as Omit<UserRecord, 'location_ids' | 'location_names'>),
                location_ids: effectiveLocationIds,
                location_names: selectedLocationNames,
              }
            : user
        )
      )
    } else {
      const { data, error } = await supabase
        .from('users')
        .insert({
          user_name: trimmedName,
          user_email: trimmedEmail,
          user_password: sha256(trimmedPassword),
          status,
          role,
        })
        .select('id, user_name, user_email, status, role')
        .single()

      if (error) {
        setErrorMessage(
          error.code === '23505' ? 'User email already exists. Please use a different email.' : error.message
        )
        setIsSaving(false)
        return
      }

      const insertedUserId = (data as { id: number }).id
      const mappingError = await saveUserLocations(insertedUserId, effectiveLocationIds)
      if (mappingError) {
        setErrorMessage(mappingError.message)
        setIsSaving(false)
        return
      }

      const selectedLocationNames = locations
        .filter((location) => effectiveLocationIds.includes(location.id))
        .map((location) => location.shop_name)

      setUsers((prev) => [
        {
          ...(data as Omit<UserRecord, 'location_ids' | 'location_names'>),
          location_ids: effectiveLocationIds,
          location_names: selectedLocationNames,
        },
        ...prev,
      ])
    }

    setIsSaving(false)
    setIsModalOpen(false)
    setEditingUserId(null)
    resetForm()
  }

  const handleDeleteConfirm = async () => {
    if (deleteUserId === null) return

    setIsDeleting(true)
    setErrorMessage(null)

    const { error } = await supabase.from('users').delete().eq('id', deleteUserId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    setUsers((prev) => prev.filter((user) => user.id !== deleteUserId))
    setDeleteUserId(null)
    setOpenActionMenuId(null)
    setIsDeleting(false)
  }

  const isUserNameInvalid = showValidation && userName.trim().length === 0
  const isUserEmailInvalid = showValidation && userEmail.trim().length === 0
  const isUserPasswordInvalid =
    showValidation && editingUserId === null && userPassword.trim().length === 0

    return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
              <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          Add User
              </button>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-lg bg-white shadow md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">User Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">User Email</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Password</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Role</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Locations</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">
                    No users added yet.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="border-t">
                    <td className="px-4 py-3 text-sm text-gray-700">{user.user_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{user.user_email}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">********</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{user.status}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{user.role}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
              <button
                        type="button"
                        onClick={() => setLocationsPopupUser(user)}
                        className="text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {`${user.location_names.length} locations`}
              </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
              <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteUserId(user.id)}
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

      <div className="mt-6 space-y-3 md:hidden">
        {isLoading ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            No users added yet.
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedUser(user)
                setOpenActionMenuId(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedUser(user)
                  setOpenActionMenuId(null)
                }
              }}
              className="relative min-h-[64px] rounded-xl bg-white px-4 py-3 shadow"
            >
              <div className="flex min-h-[40px] items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      user.status === 'Active' ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <h3 className="text-base font-semibold text-gray-800">{user.user_name}</h3>
                </div>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenActionMenuId((prev) => (prev === user.id ? null : user.id))
                    }}
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                    aria-label="Open user actions"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  {openActionMenuId === user.id ? (
                    <div className="absolute right-0 top-10 z-20 min-w-[130px] rounded-md border bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditModal(user)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteUserId(user.id)
                          setOpenActionMenuId(null)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))
                  )}
                </div>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingUserId !== null ? 'Edit User' : 'Add User'}
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

            <form onSubmit={handleAddOrUpdateUser} className="space-y-4 px-4 py-4 md:px-5 md:py-5">
                <div>
                <label htmlFor="user-name" className="mb-1 block text-sm font-medium text-gray-700">
                  User Name
                  </label>
                  <input
                  id="user-name"
                    type="text"
                  value={userName}
                  onChange={(event) => setUserName(event.target.value)}
                  placeholder="Enter user name"
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isUserNameInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                  />
                {isUserNameInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">User Name is required.</p>
                ) : null}
                </div>

                <div>
                <label htmlFor="user-email" className="mb-1 block text-sm font-medium text-gray-700">
                  User Email
                  </label>
                  <input
                  id="user-email"
                  type="email"
                  value={userEmail}
                  onChange={(event) => setUserEmail(event.target.value)}
                  placeholder="Enter user email"
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isUserEmailInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isUserEmailInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">User Email is required.</p>
                ) : null}
                </div>

                <div>
                <label htmlFor="user-password" className="mb-1 block text-sm font-medium text-gray-700">
                  Password
                  </label>
                <div className="relative">
                  <input
                    id="user-password"
                    type={isPasswordVisible ? 'text' : 'password'}
                    value={userPassword}
                    onChange={(event) => setUserPassword(event.target.value)}
                    placeholder={
                      editingUserId !== null
                        ? 'Leave blank to keep current password'
                        : 'Enter user password'
                    }
                    className={`w-full rounded-md bg-white px-3 py-2 pr-10 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                      isUserPasswordInvalid
                        ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                        : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setIsPasswordVisible((prev) => !prev)}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-500 hover:text-gray-700"
                    aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                  >
                    {isPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {isUserPasswordInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Password is required.</p>
                ) : null}
                </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="user-status" className="mb-1 block text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    id="user-status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value as UserStatus)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Active">Active</option>
                    <option value="In-active">In-active</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-gray-700">
                    Role
                  </label>
                  <select
                    id="user-role"
                    value={role}
                    onChange={(event) => setRole(event.target.value as UserRole)}
                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Admin">Admin</option>
                    <option value="Managment">Managment</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                </div>
                </div>

                <div>
                <p className="mb-2 block text-sm font-medium text-gray-700">Locations</p>
                {isLocationsSelectionDisabled ? (
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    Location selection is disabled for Admin role.
                  </p>
                ) : null}
                {locations.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    No locations available. Please add locations first.
                  </div>
                ) : (
                  <div ref={locationsDropdownRef} className="relative">
                    <button
                      type="button"
                      disabled={isLocationsSelectionDisabled}
                      onClick={() => {
                        if (isLocationsSelectionDisabled) return
                        setIsLocationsDropdownOpen((prev) => !prev)
                        setLocationSearchTerm('')
                      }}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm ${
                        isLocationsSelectionDisabled
                          ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                          : 'border-gray-300 bg-white text-gray-900'
                      }`}
                    >
                      <span className="truncate text-left">
                        {selectedLocationIds.length > 0
                          ? `${selectedLocationIds.length} location(s) selected`
                          : 'Select locations'}
                    </span>
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    </button>

                    {isLocationsDropdownOpen ? (
                      <div className="absolute z-20 mt-1 max-h-44 w-full overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-lg">
                        <input
                          type="text"
                          value={locationSearchTerm}
                          onChange={(event) => setLocationSearchTerm(event.target.value)}
                          placeholder="Search location..."
                          className="mb-2 w-full rounded-md border border-gray-300 bg-white px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        />
                        {filteredLocations.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-gray-500">No location found.</p>
                        ) : (
                          filteredLocations.map((location) => (
                            <label
                              key={location.id}
                              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={selectedLocationIds.includes(location.id)}
                                disabled={isLocationsSelectionDisabled}
                                onChange={() => toggleLocationSelection(location.id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span>{location.shop_name}</span>
                  </label>
                          ))
                        )}
                </div>
                    ) : null}
                  </div>
                )}
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
                  {isSaving ? 'Saving...' : editingUserId !== null ? 'Update User' : 'Save User'}
                </button>
                </div>
            </form>
              </div>
        </div>
      ) : null}

      {deleteUserId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete User</h2>
                </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this user? This action cannot be undone.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteUserId(null)}
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

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">User Details</h2>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-lg font-semibold leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close details modal"
              >
                X
              </button>
                </div>
            <div className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">User Name</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{selectedUser.user_name}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">User Email</p>
                <p className="mt-1 text-sm text-gray-800">{selectedUser.user_email}</p>
                </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status / Role</p>
                <p className="mt-1 text-sm text-gray-800">
                  {selectedUser.status} / {selectedUser.role}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Locations</p>
                {selectedUser.location_names.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {selectedUser.location_names.map((locationName, index) => (
                      <div
                        key={`${selectedUser.id}-detail-${locationName}-${index}`}
                        className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-sm text-gray-800"
                      >
                        {locationName}
                </div>
                    ))}
              </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-800">-</p>
                )}
                </div>
              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={openDeleteFromDetails}
                  className="rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={openEditFromDetails}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Edit
                </button>
              </div>
            </div>
        </div>
      </div>
      ) : null}

      {locationsPopupUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Assigned Locations</h2>
          <button
                type="button"
                onClick={() => setLocationsPopupUser(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-lg font-semibold leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close locations modal"
              >
                X
          </button>
        </div>
            <div className="space-y-3 px-4 py-4 md:px-5 md:py-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">User</p>
                <p className="mt-1 text-sm font-semibold text-gray-900">{locationsPopupUser.user_name}</p>
            </div>

              <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
                {locationsPopupUser.location_names.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-gray-600">No locations assigned.</p>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {locationsPopupUser.location_names.map((locationName, index) => (
                      <div
                        key={`${locationsPopupUser.id}-${locationName}-${index}`}
                        className="px-3 py-2 text-sm text-gray-800"
                      >
                        {locationName}
                      </div>
                    ))}
                  </div>
                )}
                        </div>

              <div className="flex justify-end border-t pt-4">
                          <button
                  type="button"
                  onClick={() => setLocationsPopupUser(null)}
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
