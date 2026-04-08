import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { error: e2 } = await supabase.from('queue').update({status: 'canceled'}).eq('id', 0);
  console.log('canceled error:', e2);
  const { error: e3 } = await supabase.from('queue').update({status: 'cancelled'}).eq('id', 0);
  console.log('cancelled error:', e3);
  const { error: e4 } = await supabase.from('queue').update({status: 'completed'}).eq('id', 0);
  console.log('completed error:', e4);
}
check();
