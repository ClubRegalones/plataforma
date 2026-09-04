import { createClient } from '@supabase/supabase-js'
import type { Database } from '@club-regalones/domain'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Faltan las variables VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY',
  )
}

export const supabase = createClient<Database>(
  supabaseUrl,
  supabasePublishableKey,
)
