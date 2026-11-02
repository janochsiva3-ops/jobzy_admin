import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';
import { ensureFreshFromSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  evaluateProviderSubscriptions();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status'); // 'pending' | 'all' | etc.
  const isRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  const db = getDb();
  await ensureFreshFromSupabase(db, ['users', 'provider_profiles', 'categories', 'transactions', 'provider_subscriptions'], isRefresh ? 0 : 15000);
  let query = `
    SELECT 
      u.id, u.name, u.email, u.phone, u.district, u.city, u.avatar, u.status as user_status,
      u.suspension_type, u.manual_suspended, u.subscription_suspended, u.created_at,
      p.confirmation_id, p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
      p.verification_status, p.verification_documents, p.verification_notes, p.verified_at,
      p.reviewed_by, p.reviewed_at, p.decision_reason, p.skills, p.qualifications,
      p.registration_fee_paid, p.registration_payment_id,
      t.transaction_reference as registration_txn_ref, t.updated_at as registration_paid_at, t.amount as registration_paid_amount,
      ps.status as subscription_status, ps.next_due_date as subscription_next_due_date, ps.grace_period_end as subscription_grace_period_end,
      c.name as category_name,
      admin.name as reviewer_name
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users admin ON p.reviewed_by = admin.id
    LEFT JOIN transactions t ON p.registration_payment_id = t.id
    LEFT JOIN provider_subscriptions ps ON p.id = ps.provider_id
    WHERE u.status != 'removed'
  `;
  const params = [];

  if (statusFilter && statusFilter !== 'all') {
    query += ` AND p.verification_status = ?`;
    params.push(statusFilter);
  }

  query += `
    ORDER BY 
      CASE 
        WHEN p.verification_status = 'pending' THEN 0 
        WHEN p.verification_status = 'changes_requested' THEN 1 
        ELSE 2 
      END,
      u.created_at DESC
  `;

  const queue = db.prepare(query).all(...params);

  const formatted = queue.map(q => ({
    ...q,
    verification_documents: JSON.parse(q.verification_documents || '[]'),
    skills: JSON.parse(q.skills || '[]'),
    qualifications: JSON.parse(q.qualifications || '[]')
  }));

  return NextResponse.json(formatted, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}
