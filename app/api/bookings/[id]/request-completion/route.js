import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'provider');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  if (booking.provider_id !== auth.user.id) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });

  if (!['in_progress', 'confirmed'].includes(booking.status)) {
    return NextResponse.json({ error: 'Cannot request completion from current booking status.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookings
    SET status = 'awaiting_completion', completion_requested_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, booking.id);

  createNotification(
    booking.customer_id,
    'booking',
    `Completion Confirmation Requested #${booking.booking_number}`,
    `${auth.user.name} has finished the work. Please inspect and confirm completion on your dashboard.`,
    '/customer/dashboard'
  );

  return NextResponse.json({ message: 'Completion confirmation requested from customer.' });
}
