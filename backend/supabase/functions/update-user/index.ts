import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-jwt',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type UpdateUserBody = {
  user_id: string
  full_name?: string
  mobile?: string
  designation?: string
  department_name?: string
  status?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const userJwt = req.headers.get('x-user-jwt')
  if (!userJwt) {
    return new Response(JSON.stringify({ error: 'Missing x-user-jwt header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY secret' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: callerData, error: callerError } = await admin.auth.getUser(userJwt)
  if (callerError || !callerData?.user) {
    return new Response(JSON.stringify({ error: 'Invalid caller session' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { data: callerProfile } = await admin
    .from('user_profiles')
    .select('designation')
    .eq('id', callerData.user.id)
    .maybeSingle()

  const callerDesignation = String((callerProfile as { designation?: unknown } | null)?.designation ?? '')
  if (callerDesignation !== 'Laboratory Director') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const body = (await req.json().catch(() => null)) as UpdateUserBody | null
  if (!body?.user_id) {
    return new Response(JSON.stringify({ error: 'user_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const updatePayload: Record<string, unknown> = {}
  if (typeof body.full_name === 'string') updatePayload.full_name = body.full_name
  if (typeof body.mobile === 'string') updatePayload.mobile = body.mobile
  if (typeof body.designation === 'string') updatePayload.designation = body.designation
  if (typeof body.department_name === 'string') updatePayload.department_name = body.department_name
  if (typeof body.status === 'string') updatePayload.status = body.status

  if (Object.keys(updatePayload).length === 0) {
    return new Response(JSON.stringify({ error: 'No fields to update' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: profileError } = await admin
    .from('user_profiles')
    .upsert(
      {
        id: body.user_id,
        ...updatePayload,
      },
      { onConflict: 'id' },
    )

  if (profileError) {
    return new Response(JSON.stringify({ error: profileError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const { error: authError } = await admin.auth.admin.updateUserById(body.user_id, {
    user_metadata: {
      ...updatePayload,
      updated_by: callerData.user.id,
    },
  })

  if (authError) {
    return new Response(JSON.stringify({ error: authError.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
