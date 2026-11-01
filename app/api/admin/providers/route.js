import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import getDb, { createNotification, generateConfirmationId, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  evaluateProviderSubscriptions();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const verificationStatus = searchParams.get('verificationStatus');
  const category = searchParams.get('category');
  const search = searchParams.get('search');

  const db = getDb();
  let query = `
    SELECT 
      u.id, u.name, u.email, u.phone, u.district, u.city, u.address, u.avatar, u.status as user_status, u.created_at,
      u.suspension_reason, u.suspended_at, u.suspended_by,
      u.suspension_type, u.manual_suspended, u.manual_suspension_reason, u.manual_suspended_at, u.manual_suspended_by,
      u.subscription_suspended, u.subscription_suspended_at,
      u.removal_reason, u.removed_at, u.restored_at,
      u.invitation_token, u.invitation_accepted_at,
      p.confirmation_id, p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
      p.verification_status, p.verification_documents, p.verification_notes, p.verified_at,
      p.reviewed_by, p.reviewed_at, p.decision_reason, p.rating_avg, p.review_count, p.is_sponsored,
      p.registration_fee_paid, p.registration_payment_id,
      ps.status as subscription_status, ps.next_due_date as subscription_next_due_date,
      ps.grace_period_end as subscription_grace_period_end, ps.current_period_end as subscription_current_period_end,
      ps.monthly_fee as subscription_amount, ps.grace_period_end as grace_period_end, ps.next_due_date as next_due_date,
      c.name as category_name, c.id as category_id,
      susp_admin.name as manual_suspended_by_name,
      COUNT(b.id) as total_bookings,
      SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END) as completed_jobs,
      SUM(CASE WHEN b.status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion') THEN 1 ELSE 0 END) as active_jobs
    FROM users u
    JOIN provider_profiles p ON u.id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN provider_subscriptions ps ON u.id = ps.provider_id
    LEFT JOIN users susp_admin ON u.manual_suspended_by = susp_admin.id
    LEFT JOIN bookings b ON u.id = b.provider_id
    WHERE u.role = 'provider'
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

  if (verificationStatus && verificationStatus !== 'all') {
    query += ` AND p.verification_status = ?`;
    params.push(verificationStatus);
  }

  if (category && category !== 'all') {
    query += ` AND (c.slug = ? OR c.id = ?)`;
    params.push(category, category);
  }

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    query += ` AND (u.name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.confirmation_id LIKE ? OR p.title LIKE ? OR u.city LIKE ? OR u.district LIKE ?)`;
    params.push(term, term, term, term, term, term, term);
  }

  query += ` GROUP BY u.id ORDER BY u.created_at DESC`;

  const providers = db.prepare(query).all(...params);

  const formatted = providers.map(p => {
    let docs = [];
    try {
      docs = JSON.parse(p.verification_documents || '[]');
    } catch (e) {
      docs = [];
    }
    return {
      ...p,
      verification_documents: docs,
      documents_count: docs.length
    };
  });

  return NextResponse.json(formatted);
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
      address = '',
      categoryId,
      title,
      bio = '',
      experienceYears = 1,
      pricingType = 'hourly',
      baseRate = 0,
      nicNumber = ''
    } = body;

    if (!name || !name.trim() || !email || !email.trim() || !title || !title.trim()) {
      return NextResponse.json({
        error: 'Provider name, email address, and professional title are required.'
      }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const trimmedPhone = phone ? phone.trim() : null;
    const db = getDb();

    // Check duplicate email or phone
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

    // Resolve category
    let resolvedCatId = categoryId;
    if (resolvedCatId) {
      const catRow = db.prepare('SELECT id FROM categories WHERE id = ? OR slug = ?').get(resolvedCatId, resolvedCatId);
      resolvedCatId = catRow?.id || null;
    }
    if (!resolvedCatId) {
      const firstCat = db.prepare('SELECT id FROM categories ORDER BY sort_order ASC LIMIT 1').get();
      resolvedCatId = firstCat?.id || null;
    }

    const userId = `usr-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const now = new Date().toISOString();
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const invitationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const lockedPasswordHash = bcrypt.hashSync(crypto.randomBytes(48).toString('hex'), 10);

    let confirmationId = null;

    const createProviderTx = db.transaction(() => {
      db.prepare(`
        INSERT INTO users (
          id, name, email, password_hash, role, phone, district, city, address, avatar,
          status, token_version, invitation_token, invitation_expires_at, created_by_admin, created_at
        ) VALUES (?, ?, ?, ?, 'provider', ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)
      `).run(
        userId,
        name.trim(),
        normalizedEmail,
        lockedPasswordHash,
        trimmedPhone,
        district,
        city.trim() || district,
        address.trim() || null,
        'https://images.unsplash.com/photo-1544717305-2782549b5136?w=200',
        invitationToken,
        invitationExpiresAt,
        auth.user.id,
        now
      );

      let attempts = 0;
      while (!confirmationId && attempts < 5) {
        try {
          const candidateId = generateConfirmationId(db);
          const docs = nicNumber
            ? [{ type: 'National Identity Card (NIC)', number: nicNumber.trim(), date: now }]
            : [];

          db.prepare(`
            INSERT INTO provider_profiles (
              id, confirmation_id, category_id, title, bio, experience_years,
              pricing_type, base_rate, service_districts, service_towns,
              skills, qualifications, portfolio_images,
              verification_status, verification_documents,
              registration_fee_paid, is_sponsored, rating_avg, review_count, availability
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', '[]', '[]', 'pending', ?, 0, 0, 0, 0, '{}')
          `).run(
            userId,
            candidateId,
            resolvedCatId,
            title.trim(),
            bio.trim(),
            parseInt(experienceYears || 1, 10),
            ['hourly', 'fixed', 'quote'].includes(pricingType) ? pricingType : 'hourly',
            parseFloat(baseRate || 0),
            JSON.stringify([district]),
            city.trim() || district,
            JSON.stringify(docs)
          );
          confirmationId = candidateId;
        } catch (err) {
          attempts++;
          if (attempts >= 5) throw err;
        }
      }
    });

    createProviderTx();

    const origin = request.headers.get('origin') || 'http://localhost:3000';
    const invitationUrl = `${origin}/accept-invitation?token=${invitationToken}`;

    createNotification(
      userId,
      'account',
      `Service Provider Account Created (${confirmationId})`,
      `Your Jobzy provider account (${confirmationId}) has been created. Please use your invitation link to verify your email and set your password. Registration fee payment and administrator approval are required before public listing.`,
      `/accept-invitation?token=${invitationToken}`
    );

    logAccountAction({
      targetUserId: userId,
      targetUserName: name.trim(),
      targetUserEmail: normalizedEmail,
      targetUserRole: 'provider',
      action: 'create_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: 'Created via Administrator Dashboard with secure email invitation',
      details: {
        confirmationId,
        verificationStatus: 'pending',
        registrationFeePaid: 0,
        subscriptionStatus: 'none'
      }
    });

    return NextResponse.json({
      success: true,
      message: `Service provider account created (${confirmationId}). Approval status is Pending and platform fees remain unpaid until settled by the provider.`,
      confirmationId,
      providerId: userId,
      provider: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        confirmationId,
        verificationStatus: 'pending',
        registrationFeePaid: 0,
        subscriptionStatus: 'none'
      },
      invitationUrl
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating provider account:', err);
    return NextResponse.json({ error: err.message || 'Failed to create provider account.' }, { status: 500 });
  }
}
