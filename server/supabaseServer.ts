import { createClient, SupabaseClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "https://tfdvmiwjkfebbanbjfkw.supabase.co";
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_publishable_i8v6qY0ymjBVagPjXJKw9w_ZxhDQsZj";

let client: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey && supabaseUrl !== "undefined" && supabaseKey !== "undefined" && !supabaseUrl.includes("placeholder")) {
  try {
    client = createClient(supabaseUrl, supabaseKey);
    console.log("[supabaseServer] Terhubung ke Supabase URL:", supabaseUrl.substring(0, 20) + "...");
  } catch (err) {
    console.warn("[supabaseServer] Gagal inisialisasi Supabase Server:", err);
  }
} else {
  console.log("[supabaseServer] Kredensial Supabase belum terkonfigurasi di server environment.");
}

export const supabaseServer = client;
