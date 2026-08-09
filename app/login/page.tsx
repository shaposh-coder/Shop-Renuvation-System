'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff } from 'lucide-react'
import { sha256 } from 'js-sha256'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedPassword = password.trim()

    if (!trimmedEmail || !trimmedPassword) {
      setErrorMessage('Email aur password required hain.')
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    const hashedPassword = sha256(trimmedPassword)

    const { data, error } = await supabase
      .from('users')
      .select('id, user_name, user_email, status, role')
      .ilike('user_email', trimmedEmail)
      .eq('user_password', hashedPassword)
      .maybeSingle()

    if (error) {
      setErrorMessage(
        error.message?.includes('JWT') || error.message?.includes('Invalid API key')
          ? 'Supabase connection failed. Check API key in .env.local.'
          : `Login failed: ${error.message}`
      )
      setIsLoading(false)
      return
    }

    if (!data) {
      setErrorMessage('Invalid login details.')
      setIsLoading(false)
      return
    }

    if (data.status !== 'Active') {
      setErrorMessage('User inactive hai. Admin se rabta karein.')
      setIsLoading(false)
      return
    }

    document.cookie = `rms_session=1; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    document.cookie = `rms_user_email=${encodeURIComponent(data.user_email)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    document.cookie = `rms_user_role=${encodeURIComponent(data.role)}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`
    localStorage.setItem('rms_session', '1')
    localStorage.setItem('rms_user_email', data.user_email)
    localStorage.setItem('rms_user_role', data.role)
    router.replace('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-6 text-2xl font-bold text-gray-800">RMS Login</h1>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter email"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-gray-700">
              Password
            </label>
            <div className="relative">
              <input
                id="login-password"
                type={isPasswordVisible ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter password"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 pr-10 text-sm text-gray-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
