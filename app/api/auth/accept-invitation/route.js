import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import getDb, { createNotification } from '@/lib/db';
import { generateToken } from '@/lib/auth';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return NextResponse.json({ error: 'Invitation token is required.' }, { status: 400 });
  }

  const db = getDb();
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.status, u.invitation_expires_at, u.invitation_accepted_at,
           p.confirmation_id, p.title
    FROM users u
    LEFT JOIN provider_profiles p ON u.id = p.id
    WHERE u.invitation_token = ?
  `).get(token);

  if (!user) {
    return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
  }

  if (user.status !== 'active') {
    return NextResponse.json({ error: 'This account is no longer active.' }, { status: 403 });
  }

  if (user.invitation_expires_at && new Date(user.invitation_expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'This invitation link has expired. Please ask an administrator to resend your invitation.' }, { status: 410 });
  }

  return NextResponse.json({
    valid: true,
    account: {
      name: user.name,
      email: user.email,
      role: user.role,
      confirmationId: user.confirmation_id || null,
      title: user.title || null
    }
  });
}

export async function POST(request) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: 'Invitation token and password are required.' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters long.' }, { status: 400 });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE invitation_token = ?').get(token);

    if (!user) {
      return NextResponse.json({ error: 'Invalid or already used invitation link.' }, { status: 404 });
    }

    if (user.status !== 'active') {
      return NextResponse.json({ error: 'This account is not active.' }, { status: 403 });
    }

    if (user.invitation_expires_at && new Date(user.invitation_expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This invitation link has expired.' }, { status: 410 });
    }

    const now = new Date().toISOString();
    const passwordHash = bcrypt.hashSync(password, 10);
    const nextTokenVersion = (user.token_version || 1) + 1;

    db.prepare(`
      UPDATE users
      SET password_hash = ?,
          invitation_token = NULL,
          invitation_accepted_at = ?,
          token_version = ?
      WHERE id = ?
    `).run(passwordHash, now, nextTokenVersion, user.id);

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    const jwtToken = generateToken(updatedUser);

    createNotification(
      user.id,
      'account',
      'Email Verified & Password Set',
      'Your Jobzy account invitation has been verified and your password is now active.',
      user.role === 'provider' ? '/provider/dashboard' : '/customer/dashboard'
    );

    return NextResponse.json({
      success: true,
      message: 'Your email has been verified and your password has been set.',
      token: jwtToken,
      user: {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role,
        phone: updatedUser.phone,
        district: updatedUser.district,
        city: updatedUser.city,
        address: updatedUser.address,
        avatar: updatedUser.avatar,
        status: updatedUser.status
      }
    });
  } catch (err) {
    console.error('Error accepting invitation:', err);
    return NextResponse.json({ error: 'Failed to complete invitation setup.' }, { status: 500 });
  }
}

