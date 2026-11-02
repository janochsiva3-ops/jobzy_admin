import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ensureFreshFromSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const paymentStatus = searchParams.get('paymentStatus');
  const customerId = searchParams.get('customerId');
  const providerId = searchParams.get('providerId');
  const date = searchParams.get('date');
  const search = searchParams.get('search');
  const isRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  const db = getDb();
  await ensureFreshFromSupabase(db, ['bookings', 'users', 'provider_profiles', 'reviews'], isRefresh ? 0 : 15000);
  let query = `
    SELECT 
      b.*,
      cust.name as customer_name, cust.email as customer_email, cust.phone as customer_phone, cust.avatar as customer_avatar,
      prov.name as provider_name, prov.email as provider_email, prov.phone as provider_phone, prov.avatar as provider_avatar,
      p.title as provider_title, p.confirmation_id as provider_confirmation_id, p.verification_status as provider_verification_status,
      r.id as review_id, r.rating as review_rating, r.review_text as review_text
    FROM bookings b
    JOIN users cust ON b.customer_id = cust.id
    JOIN users prov ON b.provider_id = prov.id
    JOIN provider_profiles p ON b.provider_id = p.id
    LEFT JOIN reviews r ON b.id = r.booking_id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== 'all') {
    query += ` AND b.status = ?`;
    params.push(status);
  }

  if (paymentStatus && paymentStatus !== 'all') {
    query += ` AND b.payment_status = ?`;
    params.push(paymentStatus);
  }

  if (customerId) {
    query += ` AND b.customer_id = ?`;
    params.push(customerId);
  }

  if (providerId) {
    query += ` AND b.provider_id = ?`;
    params.push(providerId);
  }

  if (date) {
    query += ` AND b.scheduled_date = ?`;
    params.push(date);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (
      b.booking_number LIKE ? OR 
      b.service_title LIKE ? OR 
      cust.name LIKE ? OR 
      cust.email LIKE ? OR 
      prov.name LIKE ? OR 
      p.confirmation_id LIKE ?
    )`;
    params.push(term, term, term, term, term, term);
  }

  query += ` ORDER BY b.created_at DESC`;

  const bookings = db.prepare(query).all(...params);

  const formatted = bookings.map(b => ({
    ...b,
    attachments: JSON.parse(b.attachments || '[]'),
    quote_details: b.quote_details ? JSON.parse(b.quote_details) : null
  }));

  return NextResponse.json(formatted, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

export async function PUT(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { bookingId, status, paymentStatus } = await request.json();
  if (!bookingId) {
    return NextResponse.json({ error: 'bookingId is required.' }, { status: 400 });
  }

  const db = getDb();
  const existingBooking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
  if (!existingBooking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }

  const statusesRequiringPaidBookingFee = [
    'pending',
    'awaiting_quote_approval',
    'confirmed',
    'in_progress',
    'awaiting_completion',
    'completed'
  ];

  if (status && statusesRequiringPaidBookingFee.includes(status) && existingBooking.booking_fee_status !== 'paid') {
    return NextResponse.json({
      error: 'Cannot submit to provider, accept, or confirm a booking before the customer booking fee payment is verified on the server.'
    }, { status: 400 });
  }

  const updates = [];
  const params = [];

  if (status) {
    updates.push('status = ?');
    params.push(status);
  }
  if (paymentStatus) {
    updates.push('payment_status = ?');
    params.push(paymentStatus);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(bookingId);

  db.prepare(`UPDATE bookings SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  return NextResponse.json({ message: 'Booking updated successfully.' });
}

