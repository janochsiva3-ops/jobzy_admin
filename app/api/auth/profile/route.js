import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';

export async function PUT(request) {
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { name, phone, district, city, address, avatar } = await request.json();
    const db = getDb();

    db.prepare(`
      UPDATE users
      SET name = COALESCE(?, name),
          phone = COALESCE(?, phone),
          district = COALESCE(?, district),
          city = COALESCE(?, city),
          address = COALESCE(?, address),
          avatar = COALESCE(?, avatar)
      WHERE id = ?
    `).run(name, phone, district, city, address, avatar, auth.user.id);

    const updated = db.prepare('SELECT id, name, email, role, phone, district, city, address, avatar, status FROM users WHERE id = ?').get(auth.user.id);
    return NextResponse.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    return NextResponse.json({ error: 'Could not update profile.' }, { status: 500 });
  }
}
