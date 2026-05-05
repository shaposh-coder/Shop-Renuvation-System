import { NextRequest, NextResponse } from 'next/server'

const TABLE_TO_PING = 'locations'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const authToken = serviceRoleKey || anonKey

  if (!supabaseUrl || !authToken) {
    return NextResponse.json(
      { ok: false, message: 'Missing Supabase environment variables' },
      { status: 500 }
    )
  }

  const pingUrl = `${supabaseUrl}/rest/v1/${TABLE_TO_PING}?select=id&limit=1`

  const response = await fetch(pingUrl, {
    method: 'GET',
    headers: {
      apikey: authToken,
      Authorization: `Bearer ${authToken}`,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return NextResponse.json(
      { ok: false, message: 'Supabase keepalive failed', status: response.status },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, message: 'Supabase keepalive success' })
}
