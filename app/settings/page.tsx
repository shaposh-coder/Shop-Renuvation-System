'use client'

import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { sha256 } from 'js-sha256'

interface UserProfile {
  user_name: string
  user_email: string
  role: string
  status: string
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [currentEmail, setCurrentEmail] = useState('')
  const [editName, setEditName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdatingName, setIsUpdatingName] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true)
      setErrorMessage(null)
      setSuccessMessage(null)

      const emailCookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('rms_user_email='))

      const resolvedEmail = emailCookie
        ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
        : (localStorage.getItem('rms_user_email') ?? '')

      if (!resolvedEmail) {
        setErrorMessage('Unable to find current user session.')
        setIsLoading(false)
        return
      }

      setCurrentEmail(resolvedEmail)

      const { data, error } = await supabase
        .from('users')
        .select('user_name, user_email, role, status')
        .eq('user_email', resolvedEmail)
        .maybeSingle()

      if (error) {
        setErrorMessage(error.message)
        setIsLoading(false)
        return
      }

      if (!data) {
        setErrorMessage('User profile not found.')
        setIsLoading(false)
        return
      }

      setProfile(data)
      setEditName(data.user_name)
      setIsLoading(false)
    }

    fetchProfile()
  }, [])

  const handleNameUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const trimmedName = editName.trim()
    if (!trimmedName) {
      setErrorMessage('Name is required.')
      return
    }

    if (!currentEmail) {
      setErrorMessage('User session not found. Please login again.')
      return
    }

    setIsUpdatingName(true)
    const { error } = await supabase
      .from('users')
      .update({ user_name: trimmedName })
      .eq('user_email', currentEmail)

    if (error) {
      setErrorMessage(error.message)
      setIsUpdatingName(false)
      return
    }

    setProfile((prev) => (prev ? { ...prev, user_name: trimmedName } : prev))
    setSuccessMessage('Name updated successfully.')
    setIsUpdatingName(false)
  }

  const handlePasswordUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    const trimmedPassword = newPassword.trim()
    const trimmedConfirmPassword = confirmPassword.trim()

    if (!trimmedPassword) {
      setErrorMessage('New password is required.')
      return
    }

    if (trimmedPassword.length < 6) {
      setErrorMessage('Password must be at least 6 characters.')
      return
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setErrorMessage('Password and confirm password must match.')
      return
    }

    if (!currentEmail) {
      setErrorMessage('User session not found. Please login again.')
      return
    }

    setIsUpdatingPassword(true)
    const { error } = await supabase
      .from('users')
      .update({ user_password: sha256(trimmedPassword) })
      .eq('user_email', currentEmail)

    if (error) {
      setErrorMessage(error.message)
      setIsUpdatingPassword(false)
      return
    }

    setNewPassword('')
    setConfirmPassword('')
    setSuccessMessage('Password updated successfully.')
    setIsUpdatingPassword(false)
  }

  return (
    <div className="p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">User Profile Setting</h1>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {successMessage}
        </div>
      ) : null}

      <div className="max-w-2xl rounded-lg bg-white shadow">
        {isLoading ? (
          <div className="px-4 py-6 text-sm text-gray-500 md:px-6">Loading profile...</div>
        ) : profile ? (
          <div className="divide-y">
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Name</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{profile.user_name}</p>
            </div>
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Email</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{profile.user_email}</p>
            </div>
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Role</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{profile.role}</p>
            </div>
            <div className="px-4 py-4 md:px-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Status</p>
              <p className="mt-1 text-sm font-medium text-gray-900">{profile.status}</p>
            </div>

            <form onSubmit={handleNameUpdate} className="space-y-3 px-4 py-4 md:px-6">
              <h2 className="text-sm font-semibold text-gray-800">Edit Name</h2>
              <input
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                placeholder="Enter your name"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isUpdatingName}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdatingName ? 'Updating...' : 'Update Name'}
                </button>
              </div>
            </form>

            <form onSubmit={handlePasswordUpdate} className="space-y-3 px-4 py-4 md:px-6">
              <h2 className="text-sm font-semibold text-gray-800">Change Password</h2>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="New password"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isUpdatingPassword}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  )
}
