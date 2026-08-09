import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

const isNewApiKey =
  supabaseAnonKey.startsWith('sb_publishable_') || supabaseAnonKey.startsWith('sb_secret_')

/**
 * New Supabase keys (sb_publishable_ / sb_secret_) are not JWTs.
 * supabase-js still sends them as Authorization: Bearer, which PostgREST rejects.
 * Keep the key only on the apikey header for those formats.
 */
const supabaseFetch: typeof fetch = (input, init = {}) => {
  if (!isNewApiKey) {
    return fetch(input, init)
  }

  const headers = new Headers(init.headers)
  const authorization = headers.get('Authorization')
  if (authorization === `Bearer ${supabaseAnonKey}`) {
    headers.delete('Authorization')
  }

  return fetch(input, { ...init, headers })
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: supabaseFetch,
  },
})
