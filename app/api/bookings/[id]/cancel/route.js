import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { processRefund } from '@/lib/paymentService';
import { verifyAuth } from '@/lib/auth';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { reason } = await request.json();
  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });

  if (auth.user.role !== 'admin' && booking.customer_id !== auth.user.id && booking.provider_id !== auth.user.id) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });
  }

  if (['completed', 'cancelled'].includes(booking.status)) {
    return NextResponse.json({ error: 'This booking is already finished or cancelled.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookings
    SET status = 'cancelled',
        cancellation_reason = ?,
        cancelled_by = ?,
        updated_at = ?
    WHERE id = ?
  `).run(reason || 'Cancelled by user.', auth.user.role, now, booking.id);

  if (booking.booking_fee_status === 'paid' && booking.booking_fee_payment_id) {
    try {
      processRefund(booking.booking_fee_payment_id, 'usr-admin-system', `Booking #${booking.booking_number} cancelled by ${auth.user.role}`);
    } catch (refundErr) {
      console.error('Auto-refund on cancellation error:', refundErr);
    }
  }

  const recipientId = auth.user.id === booking.customer_id ? booking.provider_id : booking.customer_id;
  createNotification(
    recipientId,
    'booking',
    `Booking #${booking.booking_number} Cancelled`,
    `Booking was cancelled by ${auth.user.name}. Reason: ${reason || 'Not specified'}.`,
    auth.user.role === 'customer' ? '/provider/dashboard' : '/customer/dashboard'
  );

  return NextResponse.json({ message: 'Booking cancelled according to Jobzy cancellation terms.' });
}
