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

  if (booking.status !== 'confirmed') {
    return NextResponse.json({ error: 'Only confirmed bookings can be started.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE bookings
    SET status = 'in_progress', updated_at = ?
    WHERE id = ?
  `).run(now, booking.id);

  createNotification(
    booking.customer_id,
    'booking',
    `Work Started on Booking #${booking.booking_number}`,
    `Provider ${auth.user.name} has begun work on your service request.`,
    '/customer/dashboard'
  );

  return NextResponse.json({ message: 'Work marked in progress.' });
}
