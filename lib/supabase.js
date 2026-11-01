import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
const { Pool } = pg;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tftqwhtvlocrrftptgsn.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmdHF3aHR2bG9jcnJmdHB0Z3NuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MDUwMjIsImV4cCI6MjEwOTA4MTAyMn0.qEJOOShlUSc0AFt4TJKbl9U34VGbrJ0aURgiOsUtYl8';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmdHF3aHR2bG9jcnJmdHB0Z3NuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MzUwNTAyMiwiZXhwIjoyMTA5MDgxMDIyfQ.WcZwlqn2G7vw2kCOkTeVK7GJwBwVc6UwuOQS3JOCIME';

// 1. Client for public/anon usage
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// 2. Client for backend/admin operations (bypasses RLS)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// 3. PostgreSQL connection pool to Supabase
let poolInstance = null;

export function getPgPool() {
  if (!poolInstance) {
    const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.tftqwhtvlocrrftptgsn:JobzySecureDb2026!LK@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
    poolInstance = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
  }
  return poolInstance;
}

// 4. Direct SQL Query helper on Supabase
export async function querySupabase(text, params = []) {
  const pool = getPgPool();
  return pool.query(text, params);
}

export default supabase;

