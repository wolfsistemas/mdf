import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
}

let db = null
let user = null
let listener = null
let chain = Promise.resolve()

function client() {
  if (!db) db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return db
}

export function sessionUser() {
  return user
}

export function setAuthListener(fn) {
  listener = fn
}

function emit() {
  if (listener) listener(user)
}

export async function init() {
  if (!isConfigured()) return null
  const { data } = await client().auth.getSession()
  user = data.session?.user || null
  client().auth.onAuthStateChange((_event, session) => {
    const next = session?.user || null
    if (next?.id !== user?.id) {
      user = next
      emit()
    }
  })
  emit()
  return user
}

export async function signIn(email, password) {
  const { data, error } = await client().auth.signInWithPassword({ email, password })
  if (error) return { error: error.message }
  user = data.user
  emit()
  return { ok: true }
}

export async function signUp(email, password) {
  const { data, error } = await client().auth.signUp({ email, password })
  if (error) return { error: error.message }
  if (!data.session) return { ok: true, confirm: true }
  user = data.user
  emit()
  return { ok: true }
}

export async function signOut() {
  user = null
  emit()
  const { error } = await client().auth.signOut()
  return error ? { error: error.message } : { ok: true }
}

function authUserId() {
  return user ? user.id : null
}

/* ============================== estado ============================== */

export function schedulePush(state) {
  if (!isConfigured() || !authUserId()) return
  chain = chain.then(() => pushState(state)).catch((err) => console.warn('push', err))
  return chain
}

async function pushState(state) {
  const uid = authUserId()
  if (!uid) return
  await client()
    .from('profiles')
    .upsert({ id: uid, settings: state.settings, active_project_id: state.activeProjectId || null }, { onConflict: 'id' })

  const rows = (state.projects || []).map((p) => ({
    id: p.id,
    user_id: uid,
    name: p.name || 'Novo orçamento',
    client: p.client || '',
    phone: p.phone || '',
    notes: p.notes || '',
    billing_basis: p.billingBasis === 'rateio' ? 'rateio' : 'used',
    furniture: p.furniture || [],
    created_at: new Date(p.createdAt || Date.now()).toISOString()
  }))

  const dbc = client()
  await dbc.from('projects').delete().eq('user_id', uid)
  if (rows.length) await dbc.from('projects').insert(rows)
}

export async function pullState() {
  const uid = authUserId()
  if (!uid) return null
  const dbc = client()

  const { data: prof } = await dbc.from('profiles').select('settings, active_project_id').eq('id', uid).maybeSingle()
  const { data: rows } = await dbc
    .from('projects')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .order('updated_at', { ascending: false })

  if (!rows || rows.length === 0) return null

  const projects = rows.map((r) => ({
    id: r.id,
    name: r.name,
    client: r.client || '',
    phone: r.phone || '',
    notes: r.notes || '',
    billingBasis: r.billing_basis === 'rateio' ? 'rateio' : 'used',
    furniture: r.furniture || [],
    createdAt: new Date(r.created_at).getTime()
  }))

  const settings =
    prof && prof.settings && Object.keys(prof.settings).length ? prof.settings : null
  const activeProjectId =
    projects.some((p) => p.id === prof?.active_project_id) ? prof.active_project_id : projects[0].id

  return { settings, activeProjectId, projects }
}
