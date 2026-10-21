import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const supabaseUrl = 'https://obtnmzjsbyeqttyzxasq.supabase.co'
const supabaseKey = 'sb_publishable_kTIPBfDO-bL8tG-Tz5I4eA_T7XfUTR8'

export const supabase = createClient(supabaseUrl, supabaseKey)
console.log('Supabase conectado:', supabase)