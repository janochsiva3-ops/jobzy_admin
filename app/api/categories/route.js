import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET() {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) as provider_count
    FROM categories c
    LEFT JOIN provider_profiles p ON c.id = p.category_id AND p.verification_status = 'approved'
    WHERE c.is_active = 1
    GROUP BY c.id
    ORDER BY c.sort_order ASC
  `).all();

  return NextResponse.json(categories);
}

export async function POST(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const { name, icon, description, image_url } = await request.json();
    if (!name) return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const id = 'cat-' + slug;

    const db = getDb();
    db.prepare(`
      INSERT INTO categories (id, name, slug, icon, description, image_url, is_active, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, 1, 99)
    `).run(id, name, slug, icon || 'Wrench', description || '', image_url || '');

    return NextResponse.json({ message: 'Category created successfully.', id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'A category with this name already exists.' }, { status: 409 });
  }
}
