import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyPayHereSignature, confirmPayment } from '@/lib/paymentService';

export async function POST(request) {
  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      formData.forEach((value, key) => {
        body[key] = value;
      });
    } else {
      body = await request.json();
    }

    const {
      merchant_id,
      order_id,
      payment_id,
      payhere_amount,
      payhere_currency,
      status_code,
      md5sig
    } = body;

    const db = getDb();
    const txn = db.prepare("SELECT * FROM transactions WHERE transaction_reference = ? OR id = ?").get(order_id, order_id);
    const feeType = txn?.fee_type || 'provider_registration';
    const feeSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = ?").get(feeType);
    const merchantSecret = feeSetting?.payhere_merchant_secret || process.env.PAYHERE_MERCHANT_SECRET;

    // Verify signature
    const isValid = verifyPayHereSignature(body, merchantSecret);
    if (!isValid) {
      console.warn('Invalid PayHere webhook signature for order:', order_id);
      return new NextResponse('Invalid signature', { status: 400 });
    }

    // Status code: 2 = Success, 0 = Pending, -1 = Canceled, -2 = Failed, -3 = Chargedback
    if (parseInt(status_code, 10) === 2) {
      const confirmResult = confirmPayment(order_id, payment_id, body, 'payhere');
      const freshTxn = confirmResult?.transaction || db.prepare("SELECT * FROM transactions WHERE transaction_reference = ? OR id = ?").get(order_id, order_id);
      if (freshTxn) {
        import('@/lib/supabaseSync').then(({ syncRowToSupabase }) => {
          syncRowToSupabase(db, 'transactions', freshTxn.id);
          if (freshTxn.fee_type === 'provider_registration') {
            syncRowToSupabase(db, 'provider_profiles', freshTxn.user_id);
          }
        }).catch(err => console.error('Supabase sync error in PayHere notify:', err));
      }
      return new NextResponse('OK', { status: 200 });
    } else if (parseInt(status_code, 10) === -2 || parseInt(status_code, 10) === -1) {
      // Mark transaction as failed / cancelled
      db.prepare(`
        UPDATE transactions
        SET status = ?, gateway_response = ?, updated_at = ?
        WHERE transaction_reference = ? AND status = 'pending'
      `).run(
        parseInt(status_code, 10) === -1 ? 'cancelled' : 'failed',
        JSON.stringify(body),
        new Date().toISOString(),
        order_id
      );
      return new NextResponse('OK', { status: 200 });
    }

    return new NextResponse('Ignored', { status: 200 });
  } catch (err) {
    console.error('Error handling PayHere webhook:', err);
    return new NextResponse('Server error', { status: 500 });
  }
}

