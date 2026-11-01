import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const booking = db.prepare(`
    SELECT 
      b.*,
      cust.name as customer_name, cust.phone as customer_phone, cust.avatar as customer_avatar, cust.email as customer_email,
      prov.name as provider_name, prov.phone as provider_phone, prov.avatar as provider_avatar, prov.email as provider_email,
      p.title as provider_title, p.pricing_type as provider_pricing_type, p.verification_status as provider_verification_status,
      r.id as review_id, r.rating as review_rating, r.review_text as review_text, r.response_text as review_response
    FROM bookings b
    JOIN users cust ON b.customer_id = cust.id
    JOIN users prov ON b.provider_id = prov.id
    JOIN provider_profiles p ON b.provider_id = p.id
    LEFT JOIN reviews r ON b.id = r.booking_id
    WHERE b.id = ?
  `).get(id);

  if (!booking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }

  if (auth.user.role !== 'admin' && booking.customer_id !== auth.user.id && booking.provider_id !== auth.user.id) {
    return NextResponse.json({ error: 'Unauthorized to view this booking.' }, { status: 403 });
  }

  const messages = db.prepare(`
    SELECT m.*, u.name as sender_name, u.avatar as sender_avatar
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.booking_id = ?
    ORDER BY m.created_at ASC
  `).all(id);

  return NextResponse.json({
    ...booking,
    attachments: JSON.parse(booking.attachments || '[]'),
    quote_details: booking.quote_details ? JSON.parse(booking.quote_details) : null,
    messages
  });
}
