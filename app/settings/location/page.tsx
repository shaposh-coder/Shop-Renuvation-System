'use client'

import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MoreVertical } from 'lucide-react'

interface Location {
  id: number
  shop_name: string
  address: string
}

export default function SettingsLocationPage() {
  const [shopName, setShopName] = useState('')
  const [address, setAddress] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [locations, setLocations] = useState<Location[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null)
  const [deleteLocationId, setDeleteLocationId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null)

  const fetchLocations = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('locations')
      .select('id, shop_name, address')
      .order('id', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    setLocations(data ?? [])
    setIsLoading(false)
  }

  useEffect(() => {
    fetchLocations()
  }, [])

  const handleAddOrUpdateLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedShopName = shopName.trim()
    const trimmedAddress = address.trim()

    if (!trimmedShopName || !trimmedAddress) {
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    if (editingLocationId !== null) {
      const { error } = await supabase
        .from('locations')
        .update({ shop_name: trimmedShopName, address: trimmedAddress })
        .eq('id', editingLocationId)

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }
    } else {
      const { error } = await supabase
        .from('locations')
        .insert({ shop_name: trimmedShopName, address: trimmedAddress })

      if (error) {
        setErrorMessage(error.message)
        setIsSaving(false)
        return
      }
    }

    await fetchLocations()
    setShopName('')
    setAddress('')
    setEditingLocationId(null)
    setIsModalOpen(false)
    setIsSaving(false)
  }

  const openAddModal = () => {
    setEditingLocationId(null)
    setShopName('')
    setAddress('')
    setIsModalOpen(true)
  }

  const openEditModal = (location: Location) => {
    setOpenActionMenuId(null)
    setEditingLocationId(location.id)
    setShopName(location.shop_name)
    setAddress(location.address)
    setIsModalOpen(true)
  }

  const openEditFromDetails = () => {
    if (!selectedLocation) return
    const locationToEdit = selectedLocation
    setSelectedLocation(null)
    openEditModal(locationToEdit)
  }

  const openDeleteFromDetails = () => {
    if (!selectedLocation) return
    setDeleteLocationId(selectedLocation.id)
    setSelectedLocation(null)
  }

  const closeFormModal = () => {
    setIsModalOpen(false)
    setEditingLocationId(null)
    setShopName('')
    setAddress('')
  }

  const handleDeleteConfirm = async () => {
    if (deleteLocationId === null) return

    setIsDeleting(true)
    setErrorMessage(null)

    const { error } = await supabase.from('locations').delete().eq('id', deleteLocationId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    await fetchLocations()
    setDeleteLocationId(null)
    setOpenActionMenuId(null)
    setIsDeleting(false)
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const filteredLocations =
    normalizedSearch.length === 0
      ? locations
      : locations.filter((location) => {
          const searchableValue = `${location.shop_name} ${location.address}`.toLowerCase()
          return searchableValue.includes(normalizedSearch)
        })

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Location</h1>
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 lg:hidden"
          >
            Add
          </button>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto lg:items-center">
          <input
            type="text"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search locations..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-64"
          />
          <button
            type="button"
            onClick={openAddModal}
            className="hidden items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 lg:inline-flex"
          >
            Add Location
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-lg bg-white shadow md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Shop Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Address</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading locations...
                  </td>
                </tr>
              ) : filteredLocations.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    No locations found.
                  </td>
                </tr>
              ) : (
                filteredLocations.map((location) => (
                  <tr key={location.id} className="border-t">
                    <td className="px-4 py-3 text-sm text-gray-700">{location.shop_name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{location.address}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(location)}
                          className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteLocationId(location.id)}
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
            Loading locations...
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            No locations found.
          </div>
        ) : (
          filteredLocations.map((location) => (
            <div
              key={location.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedLocation(location)
                setOpenActionMenuId(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedLocation(location)
                  setOpenActionMenuId(null)
                }
              }}
              className="relative min-h-[64px] rounded-xl bg-white px-4 py-3 shadow"
            >
              <div className="flex min-h-[40px] items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-800">{location.shop_name}</h3>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenActionMenuId((prev) => (prev === location.id ? null : location.id))
                    }}
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                    aria-label="Open location actions"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  {openActionMenuId === location.id ? (
                    <div className="absolute right-0 top-10 z-20 min-w-[130px] rounded-md border bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditModal(location)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteLocationId(location.id)
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
          <div className="w-full max-w-lg rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">
                {editingLocationId !== null ? 'Edit Location' : 'Add Location'}
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

            <form onSubmit={handleAddOrUpdateLocation} className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              <div>
                <label htmlFor="shop-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Shop Name
                </label>
                <input
                  id="shop-name"
                  type="text"
                  value={shopName}
                  onChange={(event) => setShopName(event.target.value)}
                  placeholder="Enter shop name"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="shop-address" className="mb-1 block text-sm font-medium text-gray-700">
                  Address
                </label>
                <textarea
                  id="shop-address"
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder="Enter shop address"
                  rows={4}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
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
                    : editingLocationId !== null
                      ? 'Update Location'
                      : 'Save Location'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteLocationId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Location</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this location? This action cannot be undone.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteLocationId(null)}
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

      {selectedLocation ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Location Details</h2>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-lg font-semibold leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close details modal"
              >
                X
              </button>
            </div>
            <div className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shop Name</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{selectedLocation.shop_name}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Address</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                  {selectedLocation.address}
                </p>
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
    </div>
  )
}
