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
    const feeSetting = db.prepare("SELECT * FROM platform_fee_settings LIMIT 1").get();
    const merchantSecret = feeSetting?.payhere_merchant_secret || process.env.PAYHERE_MERCHANT_SECRET;

    // Verify signature
    const isValid = verifyPayHereSignature(body, merchantSecret);
    if (!isValid) {
      console.warn('Invalid PayHere webhook signature for order:', order_id);
      return new NextResponse('Invalid signature', { status: 400 });
    }

    // Status code: 2 = Success, 0 = Pending, -1 = Canceled, -2 = Failed, -3 = Chargedback
    if (parseInt(status_code, 10) === 2) {
      confirmPayment(order_id, payment_id, body, 'payhere');
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

