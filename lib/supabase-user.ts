import { createClient } from '@supabase/supabase-js'

// Cliente Supabase que age COMO o usuário logado (usa o token do request).
// Nas rotas de LEITURA do dashboard, use este no lugar do service_role: a RLS
// filtra por org sozinha (isolamento entre clientes) sem precisar escopar cada consulta.
// Se não vier token, o cliente anon sem sessão não enxerga nada (fail-safe).
export function supabaseDoUsuario(authorization?: string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: authorization || '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
