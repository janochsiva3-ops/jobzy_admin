import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import getDb from '@/lib/db';
import { ensureFreshFromSupabase, pullAllFromSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  return handleSync(request);
}

export async function POST(request) {
  return handleSync(request);
}

async function handleSync(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tablesParam = searchParams.get('tables');
    const tableList = tablesParam ? tablesParam.split(',').map(t => t.trim()).filter(Boolean) : null;

    const db = getDb();
    if (tableList && tableList.length > 0) {
      await ensureFreshFromSupabase(db, tableList, 0); // 0 = force pull now
    } else {
      await pullAllFromSupabase(db);
    }

    const tablesToCount = tableList || [
      'users', 'categories', 'platform_settings', 'advertisements',
      'platform_fee_settings', 'provider_profiles', 'bookings',
      'reviews', 'notifications', 'transactions', 'provider_subscriptions'
    ];

    const counts = {};
    for (const t of tablesToCount) {
      try {
        counts[t] = db.prepare(`SELECT count(*) as c FROM "${t}"`).get().c;
      } catch (e) {
        counts[t] = 0;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Supabase data synchronized successfully into local database cache.',
      timestamp: new Date().toISOString(),
      counts
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (err) {
    console.error('[SupabaseSync API] Error syncing:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Failed to synchronize with Supabase'
    }, { status: 500 });
  }
}

