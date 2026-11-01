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

  if (!['awaiting_completion', 'in_progress', 'confirmed'].includes(booking.status)) {
    return NextResponse.json({ error: 'Booking cannot be completed from current state.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const finalAmount = booking.final_amount || 0;
  const commissionRate = booking.platform_commission_rate || 0.10;
  const commissionAmount = Math.round(finalAmount * commissionRate);
  const netProviderAmount = finalAmount - commissionAmount;

  db.prepare(`
    UPDATE bookings
    SET status = 'completed',
        completed_at = ?,
        payment_status = 'paid_direct',
        platform_commission_amount = ?,
        updated_at = ?
    WHERE id = ?
  `).run(now, commissionAmount, now, booking.id);

  // Financial accounting ledger entry
  const ledgerId = 'led-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  db.prepare(`
    INSERT INTO financial_ledger (
      id, booking_id, provider_id, type, gross_amount, commission_rate,
      commission_amount, net_provider_amount, status, notes, recorded_at
    ) VALUES (?, ?, ?, 'booking_commission', ?, ?, ?, ?, 'recorded_due', 'Customer direct payment recorded upon verified completion. Single platform commission logged for provider periodic settlement.', ?)
  `).run(
    ledgerId,
    booking.id,
    booking.provider_id,
    finalAmount,
    commissionRate,
    commissionAmount,
    netProviderAmount,
    now
  );

  createNotification(
    booking.provider_id,
    'booking',
    `Job Completed & Confirmed #${booking.booking_number}!`,
    `Customer confirmed completion. Gross: Rs. ${finalAmount.toLocaleString()}, Net: Rs. ${netProviderAmount.toLocaleString()}.`,
    '/provider/dashboard'
  );

  createNotification(
    booking.customer_id,
    'booking',
    `Booking #${booking.booking_number} Completed`,
    'Thank you for using Jobzy! Please rate your experience and leave a review.',
    '/customer/dashboard'
  );

  return NextResponse.json({ message: 'Job confirmed completed! You can now write a review.' });
}
