import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { processRefund, evaluateProviderSubscriptions, isProviderPubliclyActive } from '@/lib/paymentService';
import { requireRole } from '@/lib/auth';

export async function POST(request, { params }) {
  const { id } = await params;
  evaluateProviderSubscriptions();
  const auth = requireRole(request, 'provider');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { action, reason, quoteAmount, quoteBreakdown, estimatedDays, validUntil } = await request.json();
    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    if (booking.provider_id !== auth.user.id) {
      return NextResponse.json({ error: 'You are not assigned to this booking.' }, { status: 403 });
    }

    // Strictly prevent any provider response/acceptance until the customer booking fee is verified as paid
    if (booking.status === 'awaiting_payment' || booking.booking_fee_status !== 'paid') {
      return NextResponse.json({
        error: 'Cannot accept or respond to this booking until the customer platform booking fee payment has been verified on the server.'
      }, { status: 400 });
    }

    // Prevent accepting new work or submitting quotes if the provider is suspended or not publicly active
    if (action === 'accept' || action === 'submit_quote') {
      if (auth.user.status === 'suspended' || !isProviderPubliclyActive(auth.user.id)) {
        return NextResponse.json({
          error: 'Your account is currently suspended or inactive due to an unpaid subscription. You cannot accept new booking requests until your subscription is active.'
        }, { status: 403 });
      }
    }

    const now = new Date().toISOString();

    if (action === 'accept') {
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
          error: `You already have another confirmed booking on ${booking.scheduled_date} at ${booking.scheduled_time_slot}.`
        }, { status: 409 });
      }

      db.prepare(`
        UPDATE bookings
        SET status = 'confirmed', updated_at = ?
        WHERE id = ?
      `).run(now, booking.id);

      createNotification(
        booking.customer_id,
        'booking',
        `Booking #${booking.booking_number} Confirmed!`,
        `Provider ${auth.user.name} accepted your appointment for ${booking.scheduled_date} (${booking.scheduled_time_slot}).`,
        '/customer/dashboard'
      );

      return NextResponse.json({ message: 'Booking confirmed successfully.', status: 'confirmed' });
    }

    if (action === 'decline') {
      if (booking.booking_fee_status === 'paid' && booking.booking_fee_payment_id) {
        try {
          processRefund(booking.booking_fee_payment_id, 'usr-admin-system', 'Provider declined booking request');
        } catch (refundErr) {
          console.error('Auto-refund on decline error:', refundErr);
        }
      }
      db.prepare(`
        UPDATE bookings
        SET status = 'declined', cancellation_reason = ?, cancelled_by = 'provider', updated_at = ?
        WHERE id = ?
      `).run(reason || 'Provider unavailable.', now, booking.id);

      createNotification(
        booking.customer_id,
        'booking',
        `Booking #${booking.booking_number} Declined`,
        `Provider ${auth.user.name} was unable to accept your request. Reason: ${reason || 'Schedule conflict'}.`,
        '/customer/dashboard'
      );

      return NextResponse.json({ message: 'Booking declined.' });
    }

    if (action === 'submit_quote') {
      if (!quoteAmount || parseFloat(quoteAmount) <= 0) {
        return NextResponse.json({ error: 'Please enter a valid quotation amount in LKR.' }, { status: 400 });
      }

      const amount = parseFloat(quoteAmount);
      const commissionSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'platform_commission_rate'").get();
      const commissionRate = commissionSetting ? parseFloat(commissionSetting.value) : 0.10;
      const commissionAmount = Math.round(amount * commissionRate);

      const quoteData = {
        amount,
        breakdown: quoteBreakdown || 'All-inclusive materials and labor quotation.',
        estimatedDays: estimatedDays || 'As agreed',
        validUntil: validUntil || '14 days from issue',
        quotedAt: now
      };

      db.prepare(`
        UPDATE bookings
        SET status = 'awaiting_quote_approval',
            final_amount = ?,
            quote_details = ?,
            platform_commission_amount = ?,
            updated_at = ?
        WHERE id = ?
      `).run(amount, JSON.stringify(quoteData), commissionAmount, now, booking.id);

      createNotification(
        booking.customer_id,
        'quote',
        `Quotation Received for #${booking.booking_number}`,
        `${auth.user.name} submitted a quotation of Rs. ${amount.toLocaleString()} for your review.`,
        '/customer/dashboard'
      );

      return NextResponse.json({ message: 'Quotation submitted to customer for approval.' });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (err) {
    console.error('Error responding to booking:', err);
    return NextResponse.json({ error: 'Error processing response.' }, { status: 500 });
  }
}
