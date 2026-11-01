import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb, { createNotification } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;
  return NextResponse.json({
    needsInitialAdmin: adminCount === 0
  });
}

export async function POST(request) {
  try {
    const db = getDb();
    const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin'").get().count;

    // Strict owner control: this endpoint ONLY executes if zero admin accounts exist
    if (adminCount > 0) {
      return NextResponse.json({
        error: 'Administrator setup is permanently locked. Platform administrator already initialized.'
      }, { status: 403 });
    }

    const { name, email, password, setupKey } = await request.json();

    // Verify system setup key if set in environment, or enforce strong password
    const envKey = process.env.JOBZY_SETUP_KEY;
    if (envKey && setupKey !== envKey) {
      return NextResponse.json({ error: 'Invalid administrator initialization key.' }, { status: 403 });
    }

    if (!name || !email || !password || password.length < 8) {
      return NextResponse.json({
        error: 'Administrator name, valid email, and a secure password of at least 8 characters are required.'
      }, { status: 400 });
    }

    const userId = 'usr-admin-' + Date.now();
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, role, phone, district, city, address, avatar, status, created_at)
      VALUES (?, ?, ?, ?, 'admin', '+94 11 234 5678', 'Colombo', 'Colombo', 'Jobzy Administration HQ', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200', 'active', ?)
    `).run(userId, name.trim(), email.toLowerCase().trim(), passwordHash, now);

    return NextResponse.json({
      message: 'Initial platform administrator account created successfully. Administrator setup is now permanently closed.'
    }, { status: 201 });
  } catch (err) {
    console.error('Initial admin setup error:', err);
    return NextResponse.json({ error: 'Server error during administrator initialization.' }, { status: 500 });
  }
}

