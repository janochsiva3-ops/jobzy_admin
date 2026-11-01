import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { confirmPayment } from '@/lib/paymentService';

export async function POST(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      transactionId,
      gatewayReference,
      paymentMethod = 'test_gateway',
      gatewayResponse = {}
    } = body;

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required.' }, { status: 400 });
    }

    const db = getDb();
    const txn = db.prepare('SELECT * FROM transactions WHERE id = ? OR transaction_reference = ?').get(transactionId, transactionId);

    if (!txn) {
      return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
    }

    // Authorization check: User can only confirm their own transaction, unless admin
    if (auth.user.role !== 'admin' && txn.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'Unauthorized to confirm this transaction.' }, { status: 403 });
    }

    // Reject any attempt to mark a payment as paid based solely on a browser redirect or screenshot
    if (body.source === 'browser_redirect' || body.unverifiedRedirect === true || body.source === 'screenshot') {
      return NextResponse.json({
        error: 'Payments cannot be marked paid from an unverified browser redirect or screenshot. Waiting for authenticated server gateway callback.'
      }, { status: 400 });
    }

    const feeSetting = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(txn.fee_type);
    if (feeSetting && feeSetting.gateway_mode === 'live' && !txn.is_test && auth.user.role !== 'admin') {
      return NextResponse.json({
        error: 'Live gateway transactions can only be verified through the authenticated server webhook callback (/api/payments/payhere/notify).'
      }, { status: 403 });
    }

    // Support test-gateway simulation outcomes
    const { simulationStatus } = body;
    if (simulationStatus === 'failed') {
      // Mark transaction as failed and return error
      const db2 = getDb();
      db2.prepare(`UPDATE transactions SET status = 'failed', updated_at = ? WHERE id = ?`).run(new Date().toISOString(), txn.id);
      return NextResponse.json({ error: 'Simulated payment failure. No charge was made.' }, { status: 402 });
    }

    const result = confirmPayment(
      txn.id,
      gatewayReference || `SIM-${simulationStatus?.toUpperCase() || 'PAY'}-${Date.now()}`,
      gatewayResponse,
      paymentMethod || (txn.is_test ? 'test_gateway' : 'payhere')
    );

    return NextResponse.json({
      success: true,
      transaction: result.transaction,
      alreadyConfirmed: result.alreadyConfirmed
    });
  } catch (err) {
    console.error('Error confirming payment:', err);
    return NextResponse.json({ error: err.message || 'Payment confirmation failed.' }, { status: 400 });
  }
}

