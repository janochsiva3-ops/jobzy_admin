import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'customer');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  if (booking.customer_id !== auth.user.id) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });

  if (booking.status === 'awaiting_payment' || booking.booking_fee_status !== 'paid') {
    return NextResponse.json({
      error: 'Cannot approve quotation or confirm booking before the customer booking fee payment is verified on the server.'
    }, { status: 400 });
  }

  if (booking.status !== 'awaiting_quote_approval') {
    return NextResponse.json({ error: 'This booking is not awaiting quotation approval.' }, { status: 400 });
  }

  const conflict = db.prepare(`
    SELECT id FROM bookings
    WHERE provider_id = ?
      AND scheduled_date = ?
      AND scheduled_time_slot = ?
      AND id != ?
      AND status IN ('confirmed', 'in_progress')
  `).get(booking.provider_id, booking.scheduled_date, booking.scheduled_time_slot, booking.id);

  if (conflict) {
    return NextResponse.json({
      error: 'The provider slot was booked in the interim. Please contact provider via message to pick another time.'
    }, { status: 409 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookings
    SET status = 'confirmed', updated_at = ?
    WHERE id = ?
  `).run(now, booking.id);

  createNotification(
    booking.provider_id,
    'booking',
    `Quotation Approved for #${booking.booking_number}!`,
    `Customer approved your quotation of Rs. ${booking.final_amount.toLocaleString()}. Booking is confirmed.`,
    '/provider/dashboard'
  );

  return NextResponse.json({ message: 'Quotation approved. Booking is now confirmed!' });
}
