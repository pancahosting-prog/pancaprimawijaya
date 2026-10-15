import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const isEnvValid = (val: any) => val && val !== 'undefined' && val !== 'null' && val !== '';

if (!isEnvValid(supabaseUrl) || !isEnvValid(supabaseAnonKey)) {
  console.warn('Supabase URL or Anon Key is missing or invalid:', { 
      url: supabaseUrl ? 'Set (but maybe invalid)' : 'Missing',
      key: supabaseAnonKey ? 'Set (but maybe invalid)' : 'Missing'
  });
}

export const supabase = createClient(
    isEnvValid(supabaseUrl) ? supabaseUrl : 'https://placeholder.supabase.co', 
    isEnvValid(supabaseAnonKey) ? supabaseAnonKey : 'placeholder'
);

export const withRetry = async (fn: () => any, retries = 3, delay = 1000): Promise<any> => {
    try {
        const result = await fn();
        // If the result is a Supabase response with an error, throw it so catch block handles it
        if (result && typeof result === 'object' && result.error) {
            throw result.error;
        }
        return result;
    } catch (err: any) {
        // Retry only on transient network errors (TypeError/Fetch failed)
        if (retries > 0 && (err.message?.includes('fetch') || err.name === 'TypeError')) {
            console.warn(`Transient error detected, retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(r => setTimeout(r, delay));
            return withRetry(fn, retries - 1, delay * 2);
        }
        throw err;
    }
};

export const testSupabaseConnection = async () => {
    console.log('Testing Supabase Connection...');
    console.log('URL:', supabaseUrl ? `${supabaseUrl.substring(0, 15)}...` : 'EMPTY');
    
    if (!isEnvValid(supabaseUrl) || !isEnvValid(supabaseAnonKey)) {
        return { success: false, error: 'Kredensial Supabase tidak valid atau kosong' };
    }
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout (15s)')), 15000)
    );

    try {
        // Race the connection against the timeout
        const result = await Promise.race([
            supabase.from('companies').select('id').limit(1),
            timeout
        ]) as any;

        if (result.error) throw result.error;
        console.log('Supabase Connection Success');
        return { success: true, data: result.data };
    } catch (err: any) {
        console.error('Supabase Connection Test Failed:', err.message);
        return { success: false, error: err.message };
    }
};
