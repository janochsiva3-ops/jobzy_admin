import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const search = searchParams.get('search');

  const db = getDb();
  let query = `
    SELECT 
      u.id, u.name, u.email, u.phone, u.district, u.city, u.address, u.avatar, u.status, u.created_at,
      u.suspension_reason, u.suspended_at, u.removal_reason, u.removed_at, u.restored_at,
      u.invitation_token, u.invitation_accepted_at,
      COUNT(b.id) as total_bookings,
      SUM(CASE WHEN b.status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion') THEN 1 ELSE 0 END) as active_bookings,
      SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_bookings,
      COALESCE(SUM(CASE WHEN b.status = 'completed' THEN b.final_amount ELSE 0 END), 0) as total_spent
    FROM users u
    LEFT JOIN bookings b ON u.id = b.customer_id
    WHERE u.role = 'customer'
  `;
  const params = [];

  if (status === 'removed') {
    query += ` AND u.status = 'removed'`;
  } else if (status && status !== 'all') {
    query += ` AND u.status = ?`;
    params.push(status);
  } else {
    // Default active list excludes removed accounts
    query += ` AND u.status != 'removed'`;
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR u.city LIKE ? OR u.district LIKE ?)`;
    params.push(term, term, term, term, term);
  }

  query += ` GROUP BY u.id ORDER BY u.created_at DESC`;

  const customers = db.prepare(query).all(...params);

  return NextResponse.json(customers);
}

export async function POST(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      name,
      email,
      phone,
      district = 'Colombo',
      city = '',
      address = ''
    } = body;

    if (!name || !name.trim() || !email || !email.trim()) {
      return NextResponse.json({ error: 'Customer name and email address are required.' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedPhone = phone ? phone.trim() : null;

    const db = getDb();

    // Duplicate check by email or phone
    const existingEmail = db.prepare('SELECT id, email, role, status FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
    if (existingEmail) {
      return NextResponse.json({
        error: `A ${existingEmail.role} account with email "${normalizedEmail}" already exists (Status: ${existingEmail.status}).`
      }, { status: 409 });
    }

    if (trimmedPhone) {
      const existingPhone = db.prepare('SELECT id, name, phone, role FROM users WHERE phone = ?').get(trimmedPhone);
      if (existingPhone) {
        return NextResponse.json({
          error: `An account (${existingPhone.name}) with phone number "${trimmedPhone}" already exists.`
        }, { status: 409 });
      }
    }

    const userId = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    // Unusable random password hash until the user sets their own password via the invitation link
    const lockedPasswordHash = bcrypt.hashSync(crypto.randomBytes(48).toString('hex'), 10);

    db.prepare(`
      INSERT INTO users (
        id, name, email, password_hash, role, phone, district, city, address, avatar,
        status, token_version, invitation_token, invitation_expires_at, created_by_admin, created_at
      ) VALUES (?, ?, ?, ?, 'customer', ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
    `).run(
      userId,
      name.trim(),
      normalizedEmail,
      lockedPasswordHash,
      trimmedPhone,
      district,
      city.trim() || district,
      address.trim() || null,
      'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=200',
      invitationToken,
      invitationExpiresAt,
      auth.user.id,
      now
    );

    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const invitationUrl = `${origin}/accept-invitation?token=${invitationToken}`;

    createNotification(
      userId,
      'account',
      'Welcome to Jobzy — Verify Your Email',
      'An administrator created your Jobzy customer account. Please use your secure invitation link to verify your email and set your password.',
      `/accept-invitation?token=${invitationToken}`
    );

    logAccountAction({
      targetUserId: userId,
      targetUserName: name.trim(),
      targetUserEmail: normalizedEmail,
      targetUserRole: 'customer',
      action: 'create_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: 'Created via Administrator Dashboard with secure email invitation',
      details: { district, city: city.trim(), invitationExpiresAt }
    });

    const createdCustomer = db.prepare(`
      SELECT id, name, email, phone, district, city, address, status, invitation_token, invitation_expires_at, created_at
      FROM users WHERE id = ?
    `).get(userId);

    return NextResponse.json({
      success: true,
      message: `Customer account created for ${name.trim()}. A secure invitation link has been generated so the user can verify their email and set their own password.`,
      customer: createdCustomer,
      invitationUrl
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating customer account:', err);
    return NextResponse.json({ error: err.message || 'Failed to create customer account.' }, { status: 500 });
  }
}
