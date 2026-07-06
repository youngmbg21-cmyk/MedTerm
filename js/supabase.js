import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Credentials live in js/config.js — the single source of truth.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export { SUPABASE_URL, SUPABASE_ANON_KEY };
