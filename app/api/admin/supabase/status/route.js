import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { querySupabase } from '@/lib/supabase';
import getDb from '@/lib/db';

const tables = [
  'users',
  'categories',
  'platform_settings',
  'advertisements',
  'platform_fee_settings',
  'fee_change_history',
  'provider_profiles',
  'bookings',
  'reviews',
  'messages',
  'notifications',
  'financial_ledger',
  'transactions',
  'provider_subscriptions',
  'account_audit_logs'
];

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getDb();
    const testQuery = await querySupabase('SELECT current_database(), now() as server_time, version()');
    const dbInfo = testQuery.rows[0];

    const counts = [];
    for (const t of tables) {
      let localCount = 0;
      let supabaseCount = 0;
      try {
        localCount = db.prepare(`SELECT count(*) as c FROM "${t}"`).get().c;
      } catch (e) {}

      try {
        const res = await querySupabase(`SELECT count(*)::int as c FROM "${t}"`);
        supabaseCount = res.rows[0].c;
      } catch (e) {}

      counts.push({
        table: t,
        local: localCount,
        supabase: supabaseCount,
        synced: localCount === supabaseCount
      });
    }

    return NextResponse.json({
      connected: true,
      database: dbInfo.current_database,
      serverTime: dbInfo.server_time,
      postgresVersion: dbInfo.version,
      projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tftqwhtvlocrrftptgsn.supabase.co',
      tables: counts,
      allSynced: counts.every(c => c.synced)
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      error: err.message
    }, { status: 500 });
  }
}

