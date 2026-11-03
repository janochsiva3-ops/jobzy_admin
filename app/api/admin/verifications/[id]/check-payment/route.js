import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { reconcileGatewayPayment, getActiveFeeSetting } from '@/lib/paymentService';
import { syncRowToSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const provider = db.prepare(`
    SELECT p.*, u.name, u.email
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    WHERE p.id = ? OR p.confirmation_id = ?
  `).get(id, id);

  if (!provider) {
    return NextResponse.json({ error: 'Provider application not found.' }, { status: 404 });
  }

  const feeSetting = getActiveFeeSetting('provider_registration');
  const feeDue = feeSetting?.amount || 2500;
  const currency = feeSetting?.currency || 'LKR';

  // 1. Locate existing registration transaction
  let txn = null;
  if (provider.registration_payment_id) {
    txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(provider.registration_payment_id);
  }
  if (!txn) {
    txn = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND fee_type = 'provider_registration'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(provider.id);
  }

  if (!txn) {
    return NextResponse.json({
      success: true,
      verified: false,
      status: 'unpaid',
      feeDue,
      currency,
      provider: {
        id: provider.id,
        name: provider.name,
        confirmation_id: provider.confirmation_id,
        registration_fee_paid: 0
      },
      message: 'No payment transaction has been initiated. Registration fee is unpaid.'
    });
  }

  // 2. Perform server reconciliation with payment gateway
  const result = await reconcileGatewayPayment(txn.id, provider.id, 'provider_registration');

  // 3. Sync updated records to Supabase
  try {
    syncRowToSupabase(db, 'provider_profiles', provider.id);
    if (result.transaction?.id) {
      syncRowToSupabase(db, 'transactions', result.transaction.id);
    }
  } catch (syncErr) {
    console.error('Supabase sync error during payment check:', syncErr);
  }

  const refreshedProvider = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(provider.id);

  return NextResponse.json({
    success: result.success,
    verified: !!result.verified,
    status: result.status,
    message: result.message,
    feeDue,
    currency,
    transaction: result.transaction || txn,
    provider: {
      id: provider.id,
      name: provider.name,
      confirmation_id: provider.confirmation_id,
      registration_fee_paid: refreshedProvider?.registration_fee_paid || 0,
      verification_status: refreshedProvider?.verification_status
    }
  });
}

export async function GET(request, context) {
  return POST(request, context);
}

