import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const db = getDb();
  const settings = db.prepare('SELECT * FROM platform_settings').all();
  const map = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json({ settings: map, raw: settings });
}

export async function PUT(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { key, value } = await request.json();
  if (!key || value === undefined) {
    return NextResponse.json({ error: 'Key and value are required.' }, { status: 400 });
  }

  const db = getDb();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO platform_settings (key, value, description, updated_at)
    VALUES (?, ?, 'Configured by Administrator', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, String(value), now);

  return NextResponse.json({ message: `Setting ${key} updated successfully.` });
}
