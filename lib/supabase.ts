import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://rwyrtnxvqlvpcimnvqhb.supabase.co'
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3eXJ0bnh2cWx2cGNpbW52cWhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxNTc0MzgsImV4cCI6MjA5NTczMzQzOH0.6y85dOdft_iJWq_Vhs6IBdPxgXMOXu4muvUP0VYheJE'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})