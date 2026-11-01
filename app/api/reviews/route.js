import { NextResponse } from 'next/server';
import getDb, { updateProviderRating, createNotification } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function POST(request) {
  const auth = requireRole(request, 'customer');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { bookingId, rating, reviewText } = await request.json();

    if (!bookingId || !rating || !reviewText) {
      return NextResponse.json({ error: 'Booking ID, rating (1-5), and review text are required.' }, { status: 400 });
    }

    const numRating = parseInt(rating, 10);
    if (numRating < 1 || numRating > 5) {
      return NextResponse.json({ error: 'Rating must be between 1 and 5 stars.' }, { status: 400 });
    }

    const db = getDb();
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (!booking) {
      return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
    }
    if (booking.customer_id !== auth.user.id) {
      return NextResponse.json({ error: 'You can only review bookings you booked yourself.' }, { status: 403 });
    }
    if (booking.status !== 'completed') {
      return NextResponse.json({ error: 'Reviews are only permitted for completed bookings.' }, { status: 400 });
    }

    const existing = db.prepare('SELECT id FROM reviews WHERE booking_id = ?').get(bookingId);
    if (existing) {
      return NextResponse.json({ error: 'You have already submitted a review for this completed booking.' }, { status: 409 });
    }

    const reviewId = 'rev-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO reviews (id, booking_id, customer_id, provider_id, rating, review_text, is_moderated, is_hidden, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(reviewId, bookingId, auth.user.id, booking.provider_id, numRating, reviewText.trim(), now);

    // Recalculate provider rating from real reviews
    updateProviderRating(booking.provider_id);

    // Notify provider
    createNotification(
      booking.provider_id,
      'booking',
      `New ${numRating}-Star Review!`,
      `${auth.user.name} reviewed booking #${booking.booking_number}.`,
      '/provider/dashboard'
    );

    return NextResponse.json({ message: 'Thank you! Your review has been published.' }, { status: 201 });
  } catch (err) {
    console.error('Review submission error:', err);
    return NextResponse.json({ error: 'Failed to publish review.' }, { status: 500 });
  }
}
