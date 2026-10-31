import http from 'node:http'
import { randomInt } from 'node:crypto'

const PORT = Number(process.env.PORT || 8080)
const REST_URL = (process.env.REST_URL || 'http://rest.railway.internal:3000').replace(/\/$/, '')
const AUTH_URL = (process.env.AUTH_URL || 'http://auth.railway.internal:9999').replace(/\/$/, '')
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const RESEND_API_KEY = process.env.RESEND_API_KEY || ''
const EMAIL_FROM =
  process.env.RESEND_FROM_EMAIL || process.env.MRM_EMAIL_FROM || 'QIRLPL <info@qirlpl.com>'

function json(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

const MAX_BODY_BYTES = 15 * 1024 * 1024

function readBody(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0)
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      const err = new Error('Request body is too large')
      err.statusCode = 413
      reject(err)
      req.resume()
      return
    }
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        const err = new Error('Request body is too large')
        err.statusCode = 413
        reject(err)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8')
      if (!raw) return resolve({})
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function callerJwt(req) {
  const userJwt = String(req.headers['x-user-jwt'] || '').trim()
  if (userJwt) return userJwt
  const auth = String(req.headers.authorization || '')
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return ''
}

async function rest(path, init = {}) {
  const res = await fetch(`${REST_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : `REST ${res.status}`
    throw new Error(message)
  }
  return data
}

async function requireUser(req) {
  const token = callerJwt(req)
  if (!token) {
    const err = new Error('Missing caller session')
    err.statusCode = 401
    throw err
  }
  const res = await fetch(`${AUTH_URL}/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SERVICE_ROLE_KEY },
  })
  if (!res.ok) {
    const err = new Error('Invalid caller session')
    err.statusCode = 401
    throw err
  }
  return res.json()
}

async function loadCallerProfile(callerId) {
  if (!callerId) return null
  const profiles = await rest(
    `/user_profiles?id=eq.${encodeURIComponent(callerId)}&select=designation,department_name,status`,
  )
  return Array.isArray(profiles) ? profiles[0] ?? null : null
}

/**
 * Signed-in, active, and either a known LIMS role or holding a module grant.
 * Uses the same public.app_is_known_staff() check as RLS (called with the
 * caller's own JWT). Falls back to "active profile with a designation" when
 * that function is not on the database yet.
 */
async function requireKnownStaff(req) {
  const caller = await requireUser(req)
  const callerId = String(caller?.id ?? '')
  const row = await loadCallerProfile(callerId)
  const status = String(row?.status ?? '').trim().toLowerCase()
  if (!callerId || !row || status === 'inactive') {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  let known = null
  try {
    const rpc = await fetch(`${REST_URL}/rpc/app_is_known_staff`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${callerJwt(req)}`,
        'Content-Type': 'application/json',
      },
      body: '{}',
    })
    if (rpc.ok) {
      const value = await rpc.json().catch(() => null)
      if (typeof value === 'boolean') known = value
    }
  } catch {
    known = null
  }
  if (known === null) known = String(row?.designation ?? '').trim() !== ''
  if (!known) {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  return caller
}

async function requireLaboratoryDirector(req) {
  const caller = await requireUser(req)
  const callerId = String(caller?.id ?? '')
  const profiles = await rest(
    `/user_profiles?id=eq.${encodeURIComponent(callerId)}&select=designation,department_name,status`,
  )
  const row = Array.isArray(profiles) ? profiles[0] : null
  const designation = String(row?.designation ?? '').trim().toLowerCase()
  const status = String(row?.status ?? '').trim().toLowerCase()
  if (!callerId || status === 'inactive' || designation !== 'laboratory director') {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  return caller
}

function canSendLabEmail(designation, department) {
  const role = String(designation ?? '').trim().toLowerCase()
  const dept = String(department ?? '').trim().toLowerCase()
  if (role === 'laboratory director') return true
  if (role === 'quality manager' && dept === 'quality assurance') return true
  if (role === 'receptionist' && dept === 'sample cell') return true
  if (role === 'sample incharge' && dept === 'sample cell') return true
  if (role === 'technical manager' && (dept === 'mechanical' || dept === 'chemical')) return true
  return false
}

async function requireCanSendLabEmail(req) {
  const caller = await requireUser(req)
  const callerId = String(caller?.id ?? '')
  const profiles = await rest(
    `/user_profiles?id=eq.${encodeURIComponent(callerId)}&select=designation,department_name,status`,
  )
  const row = Array.isArray(profiles) ? profiles[0] : null
  const status = String(row?.status ?? '').trim().toLowerCase()
  if (!callerId || status === 'inactive' || !canSendLabEmail(row?.designation, row?.department_name)) {
    const err = new Error('Forbidden')
    err.statusCode = 403
    throw err
  }
  return caller
}

async function authAdmin(path, init = {}) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  return { ok: res.ok, status: res.status, data }
}

function authErrorMessage(payload, fallback) {
  if (payload && typeof payload === 'object') {
    if ('msg' in payload && payload.msg) return String(payload.msg)
    if ('message' in payload && payload.message) return String(payload.message)
    if ('error_description' in payload && payload.error_description) {
      return String(payload.error_description)
    }
    if ('error' in payload && payload.error) return String(payload.error)
  }
  return fallback
}

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildMrmHtml(opts) {
  const rows = opts.agenda
    .map(
      (a) =>
        `<tr><td style="padding:6px 8px;border:1px solid #78716c;width:28px;text-align:center;font-weight:600;">${esc(a.letter)})</td><td style="padding:6px 8px;border:1px solid #78716c;">${esc(a.title)}${a.remarks ? `<div style="color:#78716c;font-size:12px;margin-top:4px;">${esc(a.remarks)}</div>` : ''}</td></tr>`,
    )
    .join('')
  return `<!doctype html>
<html><body style="font-family:Segoe UI,Arial,sans-serif;color:#1c1917;line-height:1.45;">
  <h2 style="margin:0 0 8px;">Management Review Meeting — Agenda</h2>
  <p style="margin:0 0 12px;color:#57534e;font-size:13px;">ISO/IEC 17025 Clause 8.9.2 · Plan <strong>${esc(opts.planCode)}</strong></p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Dates:</strong> ${esc(opts.plannedFrom)} – ${esc(opts.plannedTo)}</p>
  <p style="margin:0 0 4px;font-size:13px;"><strong>Venue:</strong> ${esc(opts.venue || '—')}</p>
  <p style="margin:0 0 16px;font-size:13px;"><strong>Chairperson:</strong> ${esc(opts.chairperson || '—')}</p>
  <table style="border-collapse:collapse;width:100%;font-size:13px;">
    <thead>
      <tr>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Ref</th>
        <th style="background:#292524;color:#fde68a;text-align:left;padding:6px 8px;border:1px solid #78716c;">Agenda point</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <p style="margin-top:16px;font-size:12px;color:#78716c;">Please review the agenda before the meeting. Contact laboratory management with any questions.</p>
</body></html>`
}

async function sendResendEmail({ to, subject, html, text, attachments }) {
  if (!RESEND_API_KEY) {
    const err = new Error('Email service not configured. Set RESEND_API_KEY on the functions service.')
    err.statusCode = 503
    throw err
  }
  const payloadBody = {
    from: EMAIL_FROM,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    ...(text ? { text } : {}),
    ...(Array.isArray(attachments) && attachments.length > 0 ? { attachments } : {}),
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payloadBody),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message =
      payload && typeof payload === 'object' && 'message' in payload
        ? String(payload.message)
        : `Resend error ${res.status}`
    const err = new Error(message)
    err.statusCode = 400
    throw err
  }
  return payload
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return []
  if (raw.length > 4) {
    const err = new Error('Too many email attachments')
    err.statusCode = 400
    throw err
  }
  return raw.map((item) => {
    const filename = String(item?.filename ?? '').trim()
    const content = String(item?.content ?? '').replace(/\s+/g, '')
    const contentType = String(item?.contentType ?? item?.content_type ?? '').trim()
    if (!filename || !content) {
      const err = new Error('Each attachment needs filename and content')
      err.statusCode = 400
      throw err
    }
    if (content.length > 12_000_000) {
      const err = new Error(`Attachment ${filename} is too large`)
      err.statusCode = 400
      throw err
    }
    return {
      filename,
      content,
      ...(contentType ? { content_type: contentType } : {}),
    }
  })
}

// ---------------------------------------------------------------------------
// Password policy. Mirrors frontend/src/lib/passwordPolicy.ts; keep the two
// (including COMMON_PASSWORDS) in step. Passwords are never trimmed; a
// password may not begin or end with a space instead.
// ---------------------------------------------------------------------------
const PASSWORD_MIN_LENGTH = 10
const PASSWORD_MAX_LENGTH = 72
const COMMON_PASSWORDS = new Set([
  '1234567890a', '1q2w3e4r5t', '1q2w3e4r5t6y', '1qaz2wsx3edc', 'a123456789', 'abc@123456',
  'abc1234567', 'abcd123456', 'abcdef1234', 'admin@1234', 'admin12345', 'asdfghjkl1',
  'changeme123', 'dragon12345', 'football123', 'india12345', 'iloveyou12', 'laboratory1',
  'letmein123', 'lims123456', 'master12345', 'monkey12345', 'p@ssw0rd123', 'pass@12345',
  'passw0rd123', 'password@123', 'password12', 'password123', 'password1234', 'princess123',
  'q1w2e3r4t5', 'qirlpl@123', 'qirlpl12345', 'qwerty@123', 'qwerty1234', 'qwerty12345',
  'qwertyuiop1', 'raipur1234', 'sunshine123', 'superman123', 'temp@12345', 'temp123456',
  'test123456', 'trustno1234', 'welcome@123', 'welcome123', 'zaq12wsxcde',
])

/** Returns an error message, or null when the password meets the policy. */
function validatePasswordPolicy(password, email) {
  const value = typeof password === 'string' ? password : ''
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`
  }
  if (value !== value.trim()) return 'Password must not begin or end with a space.'
  if (!/[A-Za-z]/.test(value) || !/[0-9]/.test(value)) {
    return 'Password must include a letter and a number.'
  }
  const lower = value.toLowerCase()
  const mail = String(email ?? '').trim().toLowerCase()
  if (mail) {
    const local = mail.split('@')[0] || ''
    if (lower === mail || (local && lower === local)) {
      return 'Password must not be your email address.'
    }
  }
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common. Choose another.'
  return null
}

/** Random temporary password that meets the policy (no look-alike characters). */
function generateTemporaryPassword(length = 14) {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + digits
  for (;;) {
    let out = ''
    for (let i = 0; i < length; i += 1) out += all[randomInt(all.length)]
    if (/[A-Za-z]/.test(out) && /[0-9]/.test(out) && !validatePasswordPolicy(out, '')) return out
  }
}

function requestIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
  return (fwd || String(req.headers['x-real-ip'] || '') || req.socket?.remoteAddress || '').slice(0, 64) || null
}

const EMAIL_RE = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/
const MAX_EMAIL_RECIPIENTS = 10

function normalizeRecipients(raw) {
  const list = (Array.isArray(raw) ? raw : [raw])
    .flatMap((item) => String(item ?? '').split(/[,;]/))
    .map((item) => item.trim())
    .filter(Boolean)
  if (list.length === 0) return []
  if (list.length > MAX_EMAIL_RECIPIENTS) {
    const err = new Error(`At most ${MAX_EMAIL_RECIPIENTS} recipients per email`)
    err.statusCode = 400
    throw err
  }
  for (const address of list) {
    if (address.length > 254 || !EMAIL_RE.test(address)) {
      const err = new Error(`Invalid recipient address: ${address.slice(0, 80)}`)
      err.statusCode = 400
      throw err
    }
  }
  return list
}

async function handleSendEmail(req, res) {
  await requireCanSendLabEmail(req)
  const body = await readBody(req)
  const to = normalizeRecipients(body.to)
  const subject = String(body.subject ?? '').trim().slice(0, 300)
  const html = String(body.html ?? body.text ?? '').trim()
  if (to.length === 0 || !subject || !html) {
    json(res, 400, { error: 'to, subject, and html are required' })
    return
  }
  const attachments = normalizeAttachments(body.attachments)
  const sent = await sendResendEmail({ to, subject, html, text: body.text, attachments })
  json(res, 200, { ok: true, id: sent.id ?? null })
}

async function handleSendMrmAgenda(req, res) {
  await requireLaboratoryDirector(req)
  const body = await readBody(req)
  const planId = String(body.planId ?? '').trim()
  if (!planId) {
    json(res, 400, { error: 'planId is required' })
    return
  }

  const plans = await rest(`/mrm_plans?id=eq.${encodeURIComponent(planId)}&select=*`)
  const plan = Array.isArray(plans) ? plans[0] : null
  if (!plan) {
    json(res, 404, { error: 'Plan not found' })
    return
  }

  const [agendaData, recipData] = await Promise.all([
    rest(
      `/mrm_agenda_items?plan_id=eq.${encodeURIComponent(planId)}&included=eq.true&select=*&order=sort_order.asc`,
    ),
    rest(`/mrm_plan_recipients?plan_id=eq.${encodeURIComponent(planId)}&select=*`),
  ])
  const recipients = Array.isArray(recipData) ? recipData : []
  if (recipients.length === 0) {
    json(res, 400, { error: 'No recipients on this plan' })
    return
  }

  const agenda = (Array.isArray(agendaData) ? agendaData : []).map((row) => ({
    letter: String(row.clause_letter ?? ''),
    title: String(row.title ?? ''),
    remarks: String(row.remarks ?? ''),
  }))
  const html = buildMrmHtml({
    planCode: String(plan.plan_code ?? ''),
    plannedFrom: String(plan.planned_from ?? ''),
    plannedTo: String(plan.planned_to ?? ''),
    venue: String(plan.venue ?? ''),
    chairperson: String(plan.chairperson ?? ''),
    agenda,
  })
  const subject = `MRM Agenda — ${String(plan.plan_code ?? planId)}`

  let sent = 0
  let failed = 0
  const results = []

  for (const r of recipients) {
    const recipientId = String(r.id ?? '')
    const userId = String(r.user_id ?? '')
    let email = String(r.email ?? '').trim()
    if (!email && userId) {
      try {
        const profiles = await rest(
          `/user_profiles?id=eq.${encodeURIComponent(userId)}&select=email`,
        )
        email = String(profiles?.[0]?.email ?? '').trim()
      } catch {
        /* ignore */
      }
    }

    if (!email) {
      failed += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email_status: 'skipped',
          email_error: 'No email address',
          email_sent_at: null,
        }),
      })
      results.push({ userId, emailStatus: 'skipped', emailError: 'No email address', emailSentAt: null })
      continue
    }

    try {
      await sendResendEmail({ to: email, subject, html })
      const sentAt = new Date().toISOString()
      sent += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          email_status: 'sent',
          email_error: '',
          email_sent_at: sentAt,
        }),
      })
      results.push({ userId, emailStatus: 'sent', emailError: '', emailSentAt: sentAt })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Send failed'
      failed += 1
      await rest(`/mrm_plan_recipients?id=eq.${encodeURIComponent(recipientId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          email,
          email_status: 'failed',
          email_error: errMsg.slice(0, 500),
          email_sent_at: null,
        }),
      })
      results.push({ userId, emailStatus: 'failed', emailError: errMsg.slice(0, 500), emailSentAt: null })
    }
  }

  if (sent > 0) {
    await rest(`/mrm_plans?id=eq.${encodeURIComponent(planId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'communicated',
        communicated_at: new Date().toISOString(),
      }),
    })
  }

  json(res, 200, { sent, failed, recipients: results })
}

async function handleCreateUser(req, res) {
  const caller = await requireLaboratoryDirector(req)
  const body = await readBody(req)

  const email = String(body.email ?? '').trim()
  // Not trimmed: the password is stored exactly as typed (the policy rejects
  // leading or trailing spaces instead).
  const password = typeof body.password === 'string' ? body.password : ''
  if (!email || !password) {
    json(res, 400, { error: 'email and password are required' })
    return
  }
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    json(res, 400, { error: 'Enter a valid email address.' })
    return
  }
  const passwordError = validatePasswordPolicy(password, email)
  if (passwordError) {
    json(res, 400, { error: passwordError })
    return
  }

  const mobileRaw = String(body.mobile ?? '')
  const fullName = String(body.full_name ?? '')
  let designation = String(body.designation ?? '').trim()
  let departmentName = String(body.department_name ?? '').trim()
  let division = String(body.division ?? '').trim()
  const status = String(body.status ?? 'Active').trim().toLowerCase() === 'inactive' ? 'Inactive' : 'Active'
  const callerId = String(caller?.id ?? '')

  // Designation, department and division must be Lab Master options (security
  // plan S-13); stored as the option label, like update_team_user does.
  if (designation || departmentName || division) {
    let options
    try {
      options = await rest('/lab_master_options?select=category,label,value&category=in.(designation,department,division)')
    } catch {
      json(res, 500, { error: 'Unable to check Lab Master options.' })
      return
    }
    const rows = Array.isArray(options) ? options : []
    const canonical = (category, value, name) => {
      if (!value) return value
      const inCategory = rows.filter((o) => o?.category === category)
      if (inCategory.length === 0) return value
      const v = value.toLowerCase()
      const match =
        inCategory.find((o) => String(o.label ?? '').trim().toLowerCase() === v) ??
        inCategory.find((o) => String(o.value ?? '').trim().toLowerCase() === v)
      if (!match) {
        const err = new Error(`${name} "${value}" is not a Lab Master option. Add it under Lab Settings first.`)
        err.statusCode = 400
        throw err
      }
      return String(match.label).trim()
    }
    try {
      designation = canonical('designation', designation, 'Designation')
      departmentName = canonical('department', departmentName, 'Department')
      division = canonical('division', division, 'Division')
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : 'Invalid Lab Master option.' })
      return
    }
  }

  const createResult = await authAdmin('/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        mobile: mobileRaw,
        designation,
        department_name: departmentName,
        division,
        status,
        created_by: callerId,
      },
    }),
  })

  if (!createResult.ok) {
    json(res, 400, {
      error: authErrorMessage(createResult.data, `Auth ${createResult.status}`),
    })
    return
  }

  const createdUser = createResult.data?.user ?? createResult.data
  const userId = String(createdUser?.id ?? '')
  if (userId) {
    try {
      await rest('/user_profiles?on_conflict=id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify({
          id: userId,
          email,
          full_name: fullName,
          mobile: mobileRaw,
          designation,
          department_name: departmentName,
          division,
          status,
        }),
      })
    } catch (err) {
      json(res, 400, { error: err instanceof Error ? err.message : 'Profile upsert failed' })
      return
    }
  }

  json(res, 200, { user: createdUser })
}

async function handleDeleteUser(req, res) {
  const caller = await requireLaboratoryDirector(req)
  const body = await readBody(req)
  const userId = String(body.user_id ?? '').trim()

  if (!userId) {
    json(res, 400, { error: 'user_id is required' })
    return
  }

  const callerId = String(caller?.id ?? '')
  if (userId === callerId) {
    json(res, 400, { error: 'You cannot delete your own account.' })
    return
  }

  try {
    await rest(`/user_profiles?id=eq.${encodeURIComponent(userId)}`, { method: 'DELETE' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : 'Profile delete failed' })
    return
  }

  const deleteResult = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
  })
  if (!deleteResult.ok) {
    json(res, 400, {
      error: authErrorMessage(deleteResult.data, `Auth ${deleteResult.status}`),
    })
    return
  }

  json(res, 200, { ok: true })
}

/**
 * Laboratory Director sets a temporary password for another user.
 * body: { user_id, password?, remove_mfa? }  (password omitted = generated
 * here and returned once; remove_mfa = also delete the user's MFA factors,
 * for a lost authenticator). Sets user_profiles.must_change_password so the user must
 * pick a new password at next sign-in, ends the user's sessions where the
 * database allows it, and records an auth_events row.
 */
async function handleResetUserPassword(req, res) {
  const caller = await requireLaboratoryDirector(req)
  const body = await readBody(req)
  const userId = String(body.user_id ?? '').trim()
  const callerId = String(caller?.id ?? '')
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    json(res, 400, { error: 'user_id is required' })
    return
  }
  if (userId === callerId) {
    json(res, 400, { error: 'Use Change password in the profile menu for your own account.' })
    return
  }

  const target = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, { method: 'GET' })
  if (!target.ok) {
    json(res, target.status === 404 ? 404 : 400, {
      error: target.status === 404 ? 'User not found' : authErrorMessage(target.data, `Auth ${target.status}`),
    })
    return
  }
  const targetEmail = String(target.data?.email ?? target.data?.user?.email ?? '')

  const supplied = typeof body.password === 'string' && body.password !== ''
  const password = supplied ? body.password : generateTemporaryPassword()
  const passwordError = validatePasswordPolicy(password, targetEmail)
  if (passwordError) {
    json(res, 400, { error: passwordError })
    return
  }

  const update = await authAdmin(`/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    body: JSON.stringify({ password }),
  })
  if (!update.ok) {
    json(res, 400, { error: authErrorMessage(update.data, `Auth ${update.status}`) })
    return
  }

  const warnings = []
  let mfaFactorsRemoved = 0
  if (body.remove_mfa === true) {
    const factors = Array.isArray(target.data?.factors) ? target.data.factors : []
    for (const factor of factors) {
      const factorId = String(factor?.id ?? '')
      if (!factorId) continue
      const del = await authAdmin(
        `/admin/users/${encodeURIComponent(userId)}/factors/${encodeURIComponent(factorId)}`,
        { method: 'DELETE' },
      )
      if (del.ok) mfaFactorsRemoved += 1
    }
    if (mfaFactorsRemoved < factors.length) {
      warnings.push('Some two-step verification factors could not be removed.')
    }
  }

  // The steps below need 20261029100000_login_security.sql. Before it is
  // applied the password is still reset; the response says what was skipped.
  let mustChange = false
  try {
    const rows = await rest(`/user_profiles?id=eq.${encodeURIComponent(userId)}&select=id`, {
      method: 'PATCH',
      body: JSON.stringify({ must_change_password: true }),
    })
    mustChange = Array.isArray(rows) && rows.length > 0
    if (!mustChange) warnings.push('No user profile row was found, so a password change is not forced.')
  } catch (err) {
    console.error('[functions] reset-user-password: flag not set:', err instanceof Error ? err.message : err)
    warnings.push('The user will not be forced to change the password (login security migration not applied).')
  }

  let sessionsRevoked = null
  try {
    const revoked = await rest('/rpc/app_revoke_user_sessions', {
      method: 'POST',
      body: JSON.stringify({ p_user_id: userId }),
    })
    sessionsRevoked = typeof revoked === 'number' && revoked >= 0 ? revoked : null
  } catch (err) {
    console.error('[functions] reset-user-password: sessions not revoked:', err instanceof Error ? err.message : err)
  }
  if (sessionsRevoked === null) {
    warnings.push('Existing sessions could not be ended; they expire when their refresh token is next used or revoked.')
  }

  try {
    await rest('/auth_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        email: targetEmail || null,
        event: 'password_reset_by_director',
        ip: requestIp(req),
        user_agent: String(req.headers['user-agent'] || '').slice(0, 512) || null,
        details: {
          by: callerId,
          generated: !supplied,
          sessions_revoked: sessionsRevoked,
          mfa_factors_removed: mfaFactorsRemoved,
        },
      }),
    })
  } catch (err) {
    console.error('[functions] reset-user-password: event not logged:', err instanceof Error ? err.message : err)
  }

  json(res, 200, {
    ok: true,
    must_change_password: mustChange,
    sessions_revoked: sessionsRevoked,
    mfa_factors_removed: mfaFactorsRemoved,
    // Only returned when generated here; the director passes it on once.
    ...(supplied ? {} : { temporary_password: password }),
    warnings,
  })
}

function resolveAiApiBase(provider, apiBaseUrl) {
  const custom = String(apiBaseUrl || '').trim().replace(/\/$/, '')
  if (custom) return custom
  if (provider === 'openrouter') return 'https://openrouter.ai/api/v1'
  if (provider === 'google') return 'https://generativelanguage.googleapis.com/v1beta/openai'
  if (provider === 'deepseek') return 'https://api.deepseek.com/v1'
  return 'https://api.openai.com/v1'
}

// ---------------------------------------------------------------------------
// AI data guard, server side (ISO/IEC 17025 clause 4.2, gap item P1-10b).
// The frontend (frontend/src/lib/aiDataGuard.ts) redacts or withholds client
// data per lab_settings.ai_client_data_mode. This is the defence in depth:
// e-mails, phone numbers, GSTIN and PAN are always replaced before anything is
// forwarded to the provider (and mapped back in the reply), and requests that
// say they carry client data are refused while the lab mode is 'off'.
// ---------------------------------------------------------------------------

const LAB_SETTINGS_SINGLETON_ID = '00000000-0000-0000-0000-000000000001'
const AI_CLIENT_DATA_MODES = new Set(['off', 'redact', 'allow_with_consent'])

async function loadAiClientDataMode() {
  try {
    let rows = await rest(
      `/lab_settings?id=eq.${LAB_SETTINGS_SINGLETON_ID}&select=ai_client_data_mode`,
    )
    if (!Array.isArray(rows) || rows.length === 0) {
      rows = await rest('/lab_settings?select=ai_client_data_mode&order=created_at.desc&limit=1')
    }
    const mode = String((Array.isArray(rows) && rows[0]?.ai_client_data_mode) || '')
      .trim()
      .toLowerCase()
    return AI_CLIENT_DATA_MODES.has(mode) ? mode : 'redact'
  } catch {
    // Column missing (migration 20261025100200 not applied) or REST error.
    return 'redact'
  }
}

const SERVER_REDACTION_PATTERNS = [
  ['EMAIL', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g],
  ['GSTIN', /(?<![A-Za-z0-9_])\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z](?![A-Za-z0-9_])/gi],
  ['PAN', /(?<![A-Za-z0-9_])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9_])/g],
  ['PHONE', /(?<![\w.+/-])(?:(?:\+|00)91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\w|\.\d)/g],
  ['PHONE', /(?<![\w.+/-])0\d{2,4}[\s-]\d{6,8}(?!\w|\.\d)/g],
  ['PHONE', /(?<![\w.])\+\d{1,3}[\s-]?\d(?:[\s-]?\d){8,12}(?!\w|\.\d)/g],
]

function createServerRedactor() {
  const byValue = new Map()
  const byPlaceholder = new Map()
  const counters = new Map()
  const redact = (text) => {
    let out = String(text ?? '')
    for (const [category, re] of SERVER_REDACTION_PATTERNS) {
      out = out.replace(re, (match) => {
        const key = `${category}:${match.toLowerCase()}`
        let placeholder = byValue.get(key)
        if (!placeholder) {
          const n = (counters.get(category) || 0) + 1
          counters.set(category, n)
          placeholder = `${category}_S${n}`
          byValue.set(key, placeholder)
          byPlaceholder.set(placeholder, match)
        }
        return placeholder
      })
    }
    return out
  }
  const restore = (text) =>
    String(text ?? '').replace(/\b(EMAIL|PHONE|GSTIN|PAN)\\?_S(\d+)\b/g, (whole, cat, n) =>
      byPlaceholder.get(`${cat}_S${n}`) ?? whole,
    )
  return { redact, restore, count: () => byPlaceholder.size }
}

async function handleQiAssistant(req, res) {
  await requireKnownStaff(req)
  const body = await readBody(req)
  const message = String(body.message ?? '').trim()
  const hasPdf =
    body.action === 'import_is_code_pdf' ||
    (Array.isArray(body.importPdfs) && body.importPdfs.length > 0) ||
    Boolean(body.importPdf?.pdfBase64)
  if (hasPdf) {
    json(res, 400, {
      error: 'PDF import is not available from QI Assistant yet. Add the record on the screen, or ask in text.',
    })
    return
  }
  if (!message) {
    json(res, 400, { error: 'message is required' })
    return
  }

  // ISO 17025 4.2: lab policy on client data sent to AI providers.
  const clientDataMode = await loadAiClientDataMode()
  const clientData = String(body.clientData ?? '').trim().toLowerCase()
  if (clientDataMode === 'off' && clientData && clientData !== 'none') {
    json(res, 403, {
      error:
        'Client data sharing with AI providers is turned off in AI Settings. Ask a general question, or ask the Laboratory Director to change the setting.',
    })
    return
  }
  if (clientDataMode !== 'allow_with_consent' && clientData === 'consented') {
    json(res, 409, {
      error: 'AI data settings changed while you were working. Please try again in a minute.',
    })
    return
  }
  const redactor = createServerRedactor()

  const settingsRows = await rest(
    '/ai_settings?id=eq.00000000-0000-0000-0000-000000000002&select=default_model_id,temperature,max_tokens,system_prompt_prefix',
  )
  const settings = Array.isArray(settingsRows) ? settingsRows[0] : null
  let models = []
  if (settings?.default_model_id) {
    models = await rest(
      `/ai_models?id=eq.${encodeURIComponent(String(settings.default_model_id))}&is_active=eq.true&select=provider,model_id,api_key,api_base_url`,
    )
  }
  if (!Array.isArray(models) || !String(models[0]?.api_key || '').trim()) {
    models = await rest(
      '/ai_models?is_active=eq.true&order=created_at.asc&limit=1&select=provider,model_id,api_key,api_base_url',
    )
  }
  const model = Array.isArray(models) ? models[0] : null
  const apiKey = String(model?.api_key || '').trim()
  if (!apiKey) {
    json(res, 400, {
      error: 'No AI model with API key configured. Go to AI Settings → AI Models and add a default model.',
    })
    return
  }
  const provider = String(model.provider || 'openai')
  if (provider === 'anthropic') {
    json(res, 400, {
      error: 'Provider "anthropic" is not supported in QI Assistant. Use an OpenAI-compatible model.',
    })
    return
  }

  const history = (Array.isArray(body.history) ? body.history : [])
    .filter((item) => item && String(item.content || '').trim() && (item.role === 'user' || item.role === 'assistant'))
    .slice(-10)
    .map((item) => ({ role: item.role, content: redactor.redact(String(item.content).trim()) }))

  const system = [
    settings?.system_prompt_prefix ? String(settings.system_prompt_prefix) : '',
    'You are QI Assistant, a helpful assistant inside Qirlpl LIMS (ISO 17025 laboratory software). Answer clearly and concisely in English unless the user writes in Hindi.',
    body.page ? `The user is on the "${String(body.page)}" page.` : '',
    'You cannot change database records from this chat. Tell the user which screen to use.',
    body.context ? `Page data:\n${redactor.redact(String(body.context)).slice(0, 12000)}` : '',
  ]
    .filter((part) => String(part).trim().length > 0)
    .join('\n\n')
  const userMessage = redactor.redact(message)

  let modelId = String(model.model_id || '').trim()
  if (provider === 'google' && modelId.startsWith('models/')) modelId = modelId.slice('models/'.length)
  const temperature = Number(settings?.temperature)
  const maxTokens = Number(settings?.max_tokens)
  const aiRes = await fetch(`${resolveAiApiBase(provider, model.api_base_url)}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: 'system', content: system }, ...history, { role: 'user', content: userMessage }],
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      max_tokens: Number.isFinite(maxTokens) ? Math.min(maxTokens, 8192) : 1024,
    }),
  })
  const aiPayload = await aiRes.json().catch(() => ({}))
  if (!aiRes.ok) {
    const raw = aiPayload && typeof aiPayload === 'object' ? aiPayload.error : null
    const errMsg =
      raw && typeof raw === 'object' && raw.message
        ? String(raw.message)
        : typeof raw === 'string'
          ? raw
          : `AI request failed (${aiRes.status})`
    json(res, 400, { error: errMsg })
    return
  }
  const rawReply = String(aiPayload?.choices?.[0]?.message?.content ?? '').trim() || 'No response from model.'
  json(res, 200, { reply: redactor.restore(rawReply) })
}

const routes = {
  'GET /health': async (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  },
  'POST /send-mrm-agenda': handleSendMrmAgenda,
  'POST /send-email': handleSendEmail,
  'POST /create-user': handleCreateUser,
  'POST /delete-user': handleDeleteUser,
  'POST /reset-user-password': handleResetUserPassword,
  'POST /qi-assistant': handleQiAssistant,
}

// Log, never exit, on a stray async error: one bad request must not stop the
// service for everyone (audit F-15).
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err instanceof Error ? err.message : err)
})
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err instanceof Error ? err.message : err)
})

const server = http.createServer(async (req, res) => {
  // A malformed request target (e.g. `//a:99999/`) makes new URL() throw; outside
  // a try block that ended the process (audit F-15). Answer 400 instead.
  let url
  try {
    url = new URL(req.url || '/', 'http://functions.local')
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Bad request')
    return
  }
  const key = `${req.method} ${url.pathname.replace(/\/$/, '') || '/'}`
  const handler = routes[key] || (key === 'GET /' ? routes['GET /health'] : null)
  if (!handler) {
    json(res, 404, { error: 'Not Found' })
    return
  }
  try {
    await handler(req, res)
  } catch (err) {
    const status = Number(err?.statusCode) || 500
    if (status >= 500) {
      // Internal REST/auth messages can name tables and columns; log them only.
      console.error(`[functions] ${key} failed:`, err instanceof Error ? err.message : err)
    }
    const message =
      status >= 500 && !err?.statusCode
        ? 'Internal error'
        : err instanceof Error
          ? err.message
          : 'Internal error'
    if (!res.headersSent) json(res, status, { error: message })
  }
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`functions listening on ${PORT}`)
})
