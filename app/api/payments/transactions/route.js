import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { getFinancialMetrics } from '@/lib/paymentService';
import { ensureFreshFromSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const feeType = searchParams.get('feeType');
    const search = searchParams.get('search');
    const date = searchParams.get('date');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;
    const isRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

    const db = getDb();
    await ensureFreshFromSupabase(db, ['transactions', 'users', 'bookings'], isRefresh ? 0 : 15000);
    let query = `
      SELECT t.*, u.name as user_full_name, u.email as user_account_email
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    // Role-based filtering (server-side protection)
    if (auth.user.role === 'customer' || auth.user.role === 'provider') {
      query += ` AND t.user_id = ?`;
      params.push(auth.user.id);
    }

    if (status && status !== 'all') {
      query += ` AND t.status = ?`;
      params.push(status);
    }

    if (feeType && feeType !== 'all') {
      query += ` AND t.fee_type = ?`;
      params.push(feeType);
    }

    if (date) {
      query += ` AND t.created_at LIKE ?`;
      params.push(`${date}%`);
    }

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      query += ` AND (t.transaction_reference LIKE ? OR t.user_name LIKE ? OR t.user_email LIKE ? OR t.related_id LIKE ?)`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const transactions = db.prepare(query).all(...params);

    let metrics = null;
    if (auth.user.role === 'admin') {
      metrics = getFinancialMetrics();
    }

    return NextResponse.json({
      transactions,
      metrics
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate'
      }
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return NextResponse.json({ error: 'Failed to retrieve transactions.' }, { status: 500 });
  }
}

