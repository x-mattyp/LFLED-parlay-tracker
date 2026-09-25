import 'server-only';
import { createClient } from '@supabase/supabase-js';

let client;

// Server-only client using the service-role key. Row Level Security blocks
// everything else, so all reads and writes go through this app's server code.
export function db() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

export function check({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
