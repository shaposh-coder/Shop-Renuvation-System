'use client'

import { FormEvent, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { MoreVertical } from 'lucide-react'

interface Category {
  id: number
  name: string
  description: string | null
}

export default function SettingsCategoriesPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null)
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [openActionMenuId, setOpenActionMenuId] = useState<number | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const hasFetchedOnceRef = useRef(false)

  const fetchCategories = async () => {
    setIsLoading(true)
    setErrorMessage(null)

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, description')
      .order('id', { ascending: false })

    if (error) {
      setErrorMessage(error.message)
      setIsLoading(false)
      return
    }

    setCategories(data ?? [])
    setIsLoading(false)
  }

  useEffect(() => {
    if (hasFetchedOnceRef.current) return
    hasFetchedOnceRef.current = true
    fetchCategories()
  }, [])

  const handleAddOrUpdateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedName = name.trim()
    const trimmedDescription = description.trim()

    if (!trimmedName) {
      setShowValidation(true)
      return
    }

    setIsSaving(true)
    setErrorMessage(null)

    if (editingCategoryId !== null) {
      const { data, error } = await supabase
        .from('categories')
        .update({ name: trimmedName, description: trimmedDescription || null })
        .eq('id', editingCategoryId)
        .select('id, name, description')
        .single()

      if (error) {
        setErrorMessage(
          error.code === '23505' ? 'Category title already exists. Please use a different title.' : error.message
        )
        setIsSaving(false)
        return
      }

      setCategories((prev) =>
        prev.map((category) => (category.id === editingCategoryId ? data : category))
      )
    } else {
      const { data, error } = await supabase
        .from('categories')
        .insert({ name: trimmedName, description: trimmedDescription || null })
        .select('id, name, description')
        .single()

      if (error) {
        setErrorMessage(
          error.code === '23505' ? 'Category title already exists. Please use a different title.' : error.message
        )
        setIsSaving(false)
        return
      }

      setCategories((prev) => [data, ...prev])
    }

    setName('')
    setDescription('')
    setEditingCategoryId(null)
    setIsModalOpen(false)
    setShowValidation(false)
    setIsSaving(false)
  }

  const openAddModal = () => {
    setEditingCategoryId(null)
    setName('')
    setDescription('')
    setShowValidation(false)
    setIsModalOpen(true)
  }

  const openEditModal = (category: Category) => {
    setOpenActionMenuId(null)
    setEditingCategoryId(category.id)
    setName(category.name)
    setDescription(category.description ?? '')
    setShowValidation(false)
    setIsModalOpen(true)
  }

  const openEditFromDetails = () => {
    if (!selectedCategory) return
    const categoryToEdit = selectedCategory
    setSelectedCategory(null)
    openEditModal(categoryToEdit)
  }

  const openDeleteFromDetails = () => {
    if (!selectedCategory) return
    setDeleteCategoryId(selectedCategory.id)
    setSelectedCategory(null)
  }

  const closeFormModal = () => {
    setIsModalOpen(false)
    setEditingCategoryId(null)
    setName('')
    setDescription('')
    setShowValidation(false)
  }

  const handleDeleteConfirm = async () => {
    if (deleteCategoryId === null) return

    setIsDeleting(true)
    setErrorMessage(null)

    const { error } = await supabase.from('categories').delete().eq('id', deleteCategoryId)

    if (error) {
      setErrorMessage(error.message)
      setIsDeleting(false)
      return
    }

    setCategories((prev) => prev.filter((category) => category.id !== deleteCategoryId))
    setDeleteCategoryId(null)
    setOpenActionMenuId(null)
    setIsDeleting(false)
  }

  const normalizedSearch = searchTerm.trim().toLowerCase()
  const isNameInvalid = showValidation && name.trim().length === 0
  const filteredCategories =
    normalizedSearch.length === 0
      ? categories
      : categories.filter((category) => {
          const searchableValue = `${category.name} ${category.description ?? ''}`.toLowerCase()
          return searchableValue.includes(normalizedSearch)
        })

  return (
    <div className="p-4 md:p-8">
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Categories</h1>
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
            placeholder="Search categories..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:w-64"
          />
          <button
            type="button"
            onClick={openAddModal}
            className="hidden items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 lg:inline-flex"
          >
            Add Category
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-6 hidden overflow-hidden rounded-lg bg-white shadow md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gradient-to-r from-blue-600 to-indigo-600">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Description</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-white">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    Loading categories...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    No categories found.
                  </td>
                </tr>
              ) : (
                filteredCategories.map((category) => (
                  <tr key={category.id} className="border-t">
                    <td className="px-4 py-3 text-sm text-gray-700">{category.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{category.description || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(category)}
                          className="rounded-md border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteCategoryId(category.id)}
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
            Loading categories...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="rounded-lg bg-white px-4 py-6 text-center text-sm text-gray-500 shadow">
            No categories found.
          </div>
        ) : (
          filteredCategories.map((category) => (
            <div
              key={category.id}
              role="button"
              tabIndex={0}
              onClick={() => {
                setSelectedCategory(category)
                setOpenActionMenuId(null)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  setSelectedCategory(category)
                  setOpenActionMenuId(null)
                }
              }}
              className="relative min-h-[64px] rounded-xl bg-white px-4 py-3 shadow"
            >
              <div className="flex min-h-[40px] items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-gray-800">{category.name}</h3>
                <div className="relative">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setOpenActionMenuId((prev) => (prev === category.id ? null : category.id))
                    }}
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100"
                    aria-label="Open category actions"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>

                  {openActionMenuId === category.id ? (
                    <div className="absolute right-0 top-10 z-20 min-w-[130px] rounded-md border bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          openEditModal(category)
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-blue-600 hover:bg-blue-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation()
                          setDeleteCategoryId(category.id)
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
                {editingCategoryId !== null ? 'Edit Category' : 'Add Category'}
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

            <form onSubmit={handleAddOrUpdateCategory} className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              <div>
                <label htmlFor="category-name" className="mb-1 block text-sm font-medium text-gray-700">
                  Name
                </label>
                <input
                  id="category-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter category name"
                  className={`w-full rounded-md bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-1 ${
                    isNameInvalid
                      ? 'border border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                  }`}
                />
                {isNameInvalid ? (
                  <p className="mt-1 text-xs font-medium text-red-600">Title is required.</p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="category-description"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Description
                  <span className="ml-1 text-xs text-gray-500">(Optional)</span>
                </label>
                <textarea
                  id="category-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Enter category description"
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
                    : editingCategoryId !== null
                      ? 'Update Category'
                      : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteCategoryId !== null ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
            <div className="border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Delete Category</h2>
            </div>
            <div className="px-4 py-4 md:px-5 md:py-5">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete this category? This action cannot be undone.
              </p>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setDeleteCategoryId(null)}
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

      {selectedCategory ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3 md:px-5">
              <h2 className="text-lg font-semibold text-gray-800">Category Details</h2>
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 text-lg font-semibold leading-none text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close details modal"
              >
                X
              </button>
            </div>
            <div className="space-y-4 px-4 py-4 md:px-5 md:py-5">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Title</p>
                <p className="mt-1 text-base font-semibold text-gray-900">{selectedCategory.name}</p>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Description
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-gray-800">
                  {selectedCategory.description || 'No description provided.'}
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
