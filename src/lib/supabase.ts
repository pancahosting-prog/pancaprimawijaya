import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://tfdvmiwjkfebbanbjfkw.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_i8v6qY0ymjBVagPjXJKw9w_ZxhDQsZj';

const rawUrl = import.meta.env.VITE_SUPABASE_URL;
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isEnvValid = (val: any) => val && val !== 'undefined' && val !== 'null' && val !== '';

const supabaseUrl = isEnvValid(rawUrl) ? rawUrl : DEFAULT_SUPABASE_URL;
const supabaseAnonKey = isEnvValid(rawKey) ? rawKey : DEFAULT_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const withRetry = async (fn: () => any, retries = 2, delay = 1000): Promise<any> => {
    try {
        const result = await fn();
        if (result && typeof result === 'object' && result.error) {
            throw result.error;
        }
        return result;
    } catch (err: any) {
        if (retries > 0 && (err.message?.includes('fetch') || err.name === 'TypeError')) {
            console.warn(`Transient error detected, retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(r => setTimeout(r, delay));
            return withRetry(fn, retries - 1, delay * 1.5);
        }
        throw err;
    }
};

export const testSupabaseConnection = async () => {
    console.log('Testing Supabase Connection...');
    console.log('URL:', supabaseUrl ? `${supabaseUrl.substring(0, 25)}...` : 'EMPTY');
    
    if (!isEnvValid(supabaseUrl) || !isEnvValid(supabaseAnonKey)) {
        return { success: false, error: 'Kredensial Supabase tidak valid atau kosong' };
    }
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Connection timeout (5s)')), 5000)
    );

    try {
        const result = await Promise.race([
            supabase.from('companies').select('id').limit(1),
            timeout
        ]) as any;

        if (result.error) throw result.error;
        console.log('Supabase Connection Success');
        return { success: true, data: result.data };
    } catch (err: any) {
        console.warn('Supabase Connection Test Warning:', err.message);
        return { success: false, error: err.message };
    }
};
