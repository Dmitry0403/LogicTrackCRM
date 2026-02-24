import { createClient } from "@supabase/supabase-js";

const normalizeEnvValue = (rawValue) =>
  String(rawValue || "")
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .replace(/^'(.*)'$/, "$1");

const SUPABASE_URL = normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL);
const SUPABASE_ANON_KEY = normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);
const SUPABASE_WORKSPACE_ID = normalizeEnvValue(import.meta.env.VITE_SUPABASE_WORKSPACE_ID || "default") || "default";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const SUPABASE_WORKSPACE_KEY = SUPABASE_WORKSPACE_ID;
