'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface UserProfile {
  user_name: string
  user_email: string
  role: string
  status: string
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true)
      setErrorMessage(null)

      const emailCookie = document.cookie
        .split('; ')
        .find((entry) => entry.startsWith('rms_user_email='))

      const currentEmail = emailCookie
        ? decodeURIComponent(emailCookie.split('=')[1] ?? '')
        : (localStorage.getItem('rms_user_email') ?? '')

      if (!currentEmail) {
        setErrorMessage('Unable to find current user session.')
        setIsLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('users')
        .select('user_name, user_email, role, status')
        .eq('user_email', currentEmail)
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
      setIsLoading(false)
    }

    fetchProfile()
  }, [])

  return (
    <div className="p-4 md:p-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-800">User Profile Setting</h1>

      {errorMessage ? (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
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
          </div>
        ) : null}
      </div>
    </div>
  )
}
