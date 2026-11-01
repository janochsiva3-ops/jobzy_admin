import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { processRefund } from '@/lib/paymentService';

export async function POST(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { transactionId, reason } = body;

    if (!transactionId) {
      return NextResponse.json({ error: 'transactionId is required.' }, { status: 400 });
    }

    const refundedTxn = processRefund(
      transactionId,
      auth.user.id,
      reason || 'Administrator approved refund'
    );

    return NextResponse.json({
      success: true,
      message: 'Refund confirmed and processed successfully.',
      transaction: refundedTxn
    });
  } catch (err) {
    console.error('Error processing refund:', err);
    return NextResponse.json({ error: err.message || 'Refund processing failed.' }, { status: 400 });
  }
}

