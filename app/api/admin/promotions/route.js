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
  const isRefresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

  const db = getDb();
  await ensureFreshFromSupabase(db, ['advertisements', 'provider_profiles', 'users'], isRefresh ? 0 : 15000);

  const ads = db.prepare('SELECT * FROM advertisements ORDER BY created_at DESC').all();
  const sponsoredProviders = db.prepare(`
    SELECT u.id, u.name, p.title, p.is_sponsored, p.sponsored_label, c.name as category_name
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_sponsored = 1
  `).all();

  return NextResponse.json({ ads, sponsoredProviders }, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

export async function POST(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { action } = body;
  const db = getDb();

  if (action === 'toggle_sponsor') {
    const { providerId, isSponsored, sponsoredLabel } = body;
    db.prepare(`
      UPDATE provider_profiles
      SET is_sponsored = ?,
          sponsored_label = ?
      WHERE id = ?
    `).run(isSponsored ? 1 : 0, sponsoredLabel || (isSponsored ? 'Featured Provider' : ''), providerId);

    return NextResponse.json({ message: 'Provider sponsored status updated.' });
  }

  if (action === 'create_ad') {
    const { title, bannerText, linkUrl, imageUrl, placement } = body;
    if (!title || !bannerText || !linkUrl) {
      return NextResponse.json({ error: 'Title, banner text, and link URL are required.' }, { status: 400 });
    }

    const id = 'ad-' + Date.now();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO advertisements (id, title, banner_text, link_url, image_url, placement, is_active, impressions, clicks, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, 0, 0, ?)
    `).run(id, title, bannerText, linkUrl, imageUrl || '', placement || 'home_hero', now);

    return NextResponse.json({ message: 'Advertisement banner created.', id }, { status: 201 });
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
}
