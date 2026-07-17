import { supabase } from '@/lib/supabase'

// fetch que anexa o token do usuário logado (pras rotas escoparem por org via RLS/orgDaRequest).
export async function fetchAuth(url: string, opts: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${session?.access_token || ''}` } })
}
