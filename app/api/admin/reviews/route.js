import { NextResponse } from 'next/server';
import getDb, { updateProviderRating } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { ensureFreshFromSupabase } from '@/lib/supabaseSync';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const isRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  const db = getDb();
  await ensureFreshFromSupabase(db, ['reviews', 'users', 'bookings'], isRefresh ? 0 : 15000);

  const reviews = db.prepare(`
    SELECT 
      r.*,
      cust.name as customer_name,
      prov.name as provider_name,
      b.booking_number, b.service_title
    FROM reviews r
    JOIN users cust ON r.customer_id = cust.id
    JOIN users prov ON r.provider_id = prov.id
    JOIN bookings b ON r.booking_id = b.id
    ORDER BY r.created_at DESC
  `).all();

  return NextResponse.json(reviews, {
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

  const { reviewId, isHidden } = await request.json();
  const db = getDb();
  const review = db.prepare('SELECT provider_id FROM reviews WHERE id = ?').get(reviewId);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });

  db.prepare('UPDATE reviews SET is_hidden = ?, is_moderated = 1 WHERE id = ?').run(isHidden ? 1 : 0, reviewId);

  updateProviderRating(review.provider_id);

  return NextResponse.json({ message: isHidden ? 'Review hidden.' : 'Review restored.' });
}
