import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'provider');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { responseText } = await request.json();
  if (!responseText) return NextResponse.json({ error: 'Response text is required.' }, { status: 400 });

  const db = getDb();
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(id);
  if (!review) return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
  if (review.provider_id !== auth.user.id) return NextResponse.json({ error: 'Unauthorized.' }, { status: 403 });

  db.prepare('UPDATE reviews SET response_text = ? WHERE id = ?').run(responseText.trim(), review.id);

  return NextResponse.json({ message: 'Response posted to customer review.' });
}
