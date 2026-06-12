import { createClient } from '@supabase/supabase-js'

// Cliente com service-role: SO USAR EM CODIGO DE SERVIDOR (app/api/*).
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)