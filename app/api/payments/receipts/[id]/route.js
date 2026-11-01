import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(request, context) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const params = await context.params;
    const { id } = params;

    const db = getDb();
    const txn = db.prepare(`
      SELECT t.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.address as user_address, u.city as user_city, u.district as user_district
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = ? OR t.transaction_reference = ?
    `).get(id, id);

    if (!txn) {
      return NextResponse.json({ error: 'Receipt not found.' }, { status: 404 });
    }

    // Role check: Only owner or admin can view receipt
    if (auth.user.role !== 'admin' && txn.user_id !== auth.user.id) {
      return NextResponse.json({ error: 'Unauthorized to view this receipt.' }, { status: 403 });
    }

    // Related details
    let relatedDetails = null;
    if (txn.fee_type === 'customer_booking' && txn.related_id) {
      relatedDetails = db.prepare(`
        SELECT b.id, b.booking_number, b.service_title, b.service_category,
               b.scheduled_date, b.scheduled_time_slot,
               prov.name as provider_name, prov.email as provider_email
        FROM bookings b
        JOIN users prov ON b.provider_id = prov.id
        WHERE b.id = ?
      `).get(txn.related_id);
    } else if (txn.fee_type === 'provider_registration' && txn.related_id) {
      relatedDetails = db.prepare(`
        SELECT p.confirmation_id, p.title as provider_title, c.name as category_name
        FROM provider_profiles p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = ? OR p.confirmation_id = ?
      `).get(txn.related_id, txn.related_id);
    } else if (txn.fee_type === 'provider_subscription') {
      relatedDetails = db.prepare(`
        SELECT ps.current_period_start, ps.current_period_end, ps.next_due_date,
               p.confirmation_id, p.title as provider_title
        FROM provider_subscriptions ps
        JOIN provider_profiles p ON ps.provider_id = p.id
        WHERE ps.provider_id = ?
      `).get(txn.user_id);
    }

    const receipt = {
      receiptNumber: `RCP-${txn.transaction_reference.replace('TXN-', '')}`,
      transactionReference: txn.transaction_reference,
      transactionId: txn.id,
      date: txn.created_at,
      paymentMethod: txn.payment_method || 'Electronic Payment',
      gatewayReference: txn.gateway_reference,
      feeType: txn.fee_type,
      feeTitle: txn.fee_type === 'provider_registration'
        ? 'Provider Registration Platform Fee'
        : txn.fee_type === 'provider_subscription'
        ? 'Monthly Provider Subscription Fee'
        : 'Customer Booking Platform Fee',
      amount: txn.amount,
      currency: txn.currency || 'LKR',
      status: txn.status,
      isTest: txn.is_test === 1,
      payer: {
        name: txn.user_name,
        email: txn.user_email,
        phone: txn.user_phone,
        address: txn.user_address,
        district: txn.user_district,
        city: txn.user_city
      },
      relatedDetails,
      refund: txn.status === 'refunded' ? {
        reason: txn.refund_reason,
        refundedAt: txn.refunded_at,
        reference: txn.refund_gateway_reference
      } : null,
      issuer: {
        name: 'Jobzy Sri Lanka Platform Ltd',
        taxId: 'LK-JOBZY-2026-VAT',
        supportEmail: 'support@jobzy.lk',
        supportPhone: '+94 70 441 3635',
        address: 'Colombo & Kilinochchi, Sri Lanka'
      }
    };

    return NextResponse.json(receipt);
  } catch (err) {
    console.error('Error generating receipt:', err);
    return NextResponse.json({ error: 'Failed to generate receipt.' }, { status: 500 });
  }
}

