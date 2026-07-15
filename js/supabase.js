import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jjpijncxlkwutbnkpsaw.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_eU3QNbS5L0EqnK8H39XUgw_B2efuOvo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
