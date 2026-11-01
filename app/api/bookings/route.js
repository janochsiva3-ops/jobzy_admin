import { NextResponse } from 'next/server';
import getDb, { createNotification, generateBookingNumber } from '@/lib/db';
import { verifyAuth, requireRole } from '@/lib/auth';
import { createPendingTransaction, evaluateProviderSubscriptions, isProviderPubliclyActive } from '@/lib/paymentService';

export async function GET(request) {
  evaluateProviderSubscriptions();
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const customerId = searchParams.get('customerId');
  const providerId = searchParams.get('providerId');
  const search = searchParams.get('search');
  const date = searchParams.get('date');

  const db = getDb();
  let query = `
    SELECT 
      b.*,
      cust.name as customer_name, cust.phone as customer_phone, cust.avatar as customer_avatar, cust.email as customer_email,
      prov.name as provider_name, prov.phone as provider_phone, prov.avatar as provider_avatar, prov.email as provider_email,
      p.title as provider_title, p.pricing_type as provider_pricing_type, p.verification_status as provider_verification_status,
      p.confirmation_id as provider_confirmation_id,
      r.id as review_id, r.rating as review_rating, r.review_text as review_text,
      t.transaction_reference as booking_fee_txn_ref
    FROM bookings b
    JOIN users cust ON b.customer_id = cust.id
    JOIN users prov ON b.provider_id = prov.id
    JOIN provider_profiles p ON b.provider_id = p.id
    LEFT JOIN reviews r ON b.id = r.booking_id
    LEFT JOIN transactions t ON b.booking_fee_payment_id = t.id
    WHERE 1=1
  `;

  const params = [];

  if (auth.user.role === 'customer') {
    query += ` AND b.customer_id = ?`;
    params.push(auth.user.id);
  } else if (auth.user.role === 'provider') {
    // Providers only see bookings that have passed awaiting_payment
    query += ` AND b.provider_id = ? AND b.status != 'awaiting_payment'`;
    params.push(auth.user.id);
  } else if (auth.user.role === 'admin') {
    if (customerId) {
      query += ` AND b.customer_id = ?`;
      params.push(customerId);
    }
    if (providerId) {
      query += ` AND b.provider_id = ?`;
      params.push(providerId);
    }
  }

  if (status && status !== 'all') {
    query += ` AND b.status = ?`;
    params.push(status);
  }

  if (date) {
    query += ` AND b.scheduled_date = ?`;
    params.push(date);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (b.booking_number LIKE ? OR b.service_title LIKE ? OR cust.name LIKE ? OR prov.name LIKE ?)`;
    params.push(term, term, term, term);
  }

  query += ` ORDER BY b.created_at DESC`;

  const bookings = db.prepare(query).all(...params);

  const formatted = bookings.map(b => ({
    ...b,
    attachments: JSON.parse(b.attachments || '[]'),
    quote_details: b.quote_details ? JSON.parse(b.quote_details) : null
  }));

  return NextResponse.json(formatted);
}

export async function POST(request) {
  const auth = requireRole(request, 'customer');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      providerId,
      serviceTitle,
      serviceCategory,
      taskDescription,
      serviceLocationType = 'in_person',
      address,
      district,
      city,
      scheduledDate,
      scheduledTimeSlot,
      attachments = []
    } = body;

    if (!providerId || !taskDescription || !scheduledDate || !scheduledTimeSlot) {
      return NextResponse.json({ error: 'Provider, task description, date, and time slot are required.' }, { status: 400 });
    }

    const db = getDb();
    evaluateProviderSubscriptions();

    if (!isProviderPubliclyActive(providerId)) {
      return NextResponse.json({
        error: 'This service provider is not currently active or eligible to receive new booking requests.'
      }, { status: 403 });
    }

    const provider = db.prepare(`
      SELECT p.*, u.name as provider_name
      FROM provider_profiles p
      JOIN users u ON p.id = u.id
      WHERE p.id = ? AND u.status = 'active' AND p.verification_status = 'approved'
    `).get(providerId);

    if (!provider) {
      return NextResponse.json({ error: 'Provider is not available or has not been verified yet.' }, { status: 404 });
    }

    // Anti-double-booking: Prevent overlapping confirmed bookings for the exact same slot
    const conflict = db.prepare(`
      SELECT id FROM bookings
      WHERE provider_id = ?
        AND scheduled_date = ?
        AND scheduled_time_slot = ?
        AND status IN ('confirmed', 'in_progress')
    `).get(providerId, scheduledDate, scheduledTimeSlot);

    if (conflict) {
      return NextResponse.json({
        error: `Provider ${provider.provider_name} already has a confirmed booking on ${scheduledDate} at ${scheduledTimeSlot}. Please choose another date or time slot.`
      }, { status: 409 });
    }

    const bookingId = 'bk-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const bookingNumber = generateBookingNumber();
    const now = new Date().toISOString();

    const isQuoteMode = provider.pricing_type === 'quote';
    const initialEstimate = isQuoteMode ? 0 : provider.base_rate;
    const finalAmount = isQuoteMode ? 0 : provider.base_rate;

    const commissionSetting = db.prepare("SELECT value FROM platform_settings WHERE key = 'platform_commission_rate'").get();
    const commissionRate = commissionSetting ? parseFloat(commissionSetting.value) : 0.10;
    const commissionAmount = isQuoteMode ? 0 : Math.round(finalAmount * commissionRate);

    // Fetch platform booking fee setting
    const feeSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = 'customer_booking'").get();
    const bookingFeeAmount = feeSetting?.amount || 350;

    // Insert booking into 'awaiting_payment' status until server-confirmed fee payment succeeds
    db.prepare(`
      INSERT INTO bookings (
        id, booking_number, customer_id, provider_id, service_category, service_title,
        task_description, service_location_type, address, district, city,
        scheduled_date, scheduled_time_slot, estimated_duration, attachments,
        pricing_type, initial_quote_estimate, final_amount, status, payment_status,
        payment_method, booking_fee_amount, booking_fee_status,
        platform_commission_rate, platform_commission_amount,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Standard duration', ?, ?, ?, ?, 'awaiting_payment', 'unpaid', 'cash_on_service', ?, 'unpaid', ?, ?, ?, ?)
    `).run(
      bookingId,
      bookingNumber,
      auth.user.id,
      providerId,
      serviceCategory || provider.title,
      serviceTitle || provider.title,
      taskDescription,
      serviceLocationType,
      address || auth.user.address || 'Sri Lanka',
      district || auth.user.district || 'Colombo',
      city || auth.user.city || 'Colombo',
      scheduledDate,
      scheduledTimeSlot,
      JSON.stringify(attachments),
      provider.pricing_type,
      initialEstimate,
      finalAmount,
      bookingFeeAmount,
      commissionRate,
      commissionAmount,
      now,
      now
    );

    // Create a pending checkout transaction for the booking fee
    const transaction = createPendingTransaction({
      userId: auth.user.id,
      userRole: 'customer',
      feeType: 'customer_booking',
      relatedId: bookingId,
      relatedType: 'booking',
      metadata: {
        booking_number: bookingNumber,
        provider_name: provider.provider_name,
        service_title: serviceTitle || provider.title,
        scheduled_date: scheduledDate,
        scheduled_time_slot: scheduledTimeSlot
      }
    });

    return NextResponse.json({
      message: 'Booking created. Platform booking fee payment required to submit to provider.',
      bookingId,
      bookingNumber,
      bookingFeeAmount,
      transaction,
      requiresPayment: true
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating booking:', err);
    return NextResponse.json({ error: err.message || 'Failed to place booking request.' }, { status: 500 });
  }
}
