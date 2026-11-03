import { NextResponse } from 'next/server';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { syncRowToSupabase } from '@/lib/supabaseSync';

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  let user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.phone, u.district, u.city, u.address, u.avatar,
           u.status, u.created_at, u.removal_reason, u.removed_at, u.restored_at,
           p.title, p.confirmation_id, p.verification_status
    FROM users u
    LEFT JOIN provider_profiles p ON u.id = p.id
    WHERE u.id = ? OR lower(trim(u.email)) = lower(trim(?))
  `).get(id, id);

  if (!user) {
    return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
  }

  let activeBookings = [];
  let pendingRefunds = [];
  let subscription = null;

  if (user.role === 'customer') {
    activeBookings = db.prepare(`
      SELECT id, booking_number, service_title, status, scheduled_date
      FROM bookings
      WHERE customer_id = ?
        AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
    `).all(user.id);

    pendingRefunds = db.prepare(`
      SELECT id, booking_number, booking_fee_amount, booking_fee_status
      FROM bookings
      WHERE customer_id = ?
        AND status IN ('declined', 'cancelled')
        AND booking_fee_status = 'paid'
    `).all(user.id);
  } else if (user.role === 'provider') {
    activeBookings = db.prepare(`
      SELECT id, booking_number, service_title, status, scheduled_date
      FROM bookings
      WHERE provider_id = ?
        AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
    `).all(user.id);

    pendingRefunds = db.prepare(`
      SELECT id, booking_number, booking_fee_amount, booking_fee_status
      FROM bookings
      WHERE provider_id = ?
        AND status IN ('declined', 'cancelled')
        AND booking_fee_status = 'paid'
    `).all(user.id);

    subscription = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(user.id);
  }

  return NextResponse.json({
    user,
    removalPrecheck: {
      canRemove: activeBookings.length === 0 && pendingRefunds.length === 0,
      activeBookings,
      pendingRefunds,
      subscription: subscription || null
    }
  });
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getDb();
    let targetUser = db.prepare(`
      SELECT u.*, p.confirmation_id
      FROM users u
      LEFT JOIN provider_profiles p ON u.id = p.id
      WHERE u.id = ? OR p.confirmation_id = ? OR lower(trim(u.email)) = lower(trim(?))
    `).get(id, id, id);

    if (!targetUser) {
      return NextResponse.json({ error: 'User account not found.' }, { status: 404 });
    }

    // 1. Prevent admin from removing their own account
    if (targetUser.id === auth.user.id) {
      return NextResponse.json({ error: 'Administrators cannot remove their own account.' }, { status: 403 });
    }

    // 2. Prevent removing the last active administrator
    if (targetUser.role === 'admin') {
      const activeAdminsCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND status = 'active'").get().cnt;
      if (activeAdminsCount <= 1) {
        return NextResponse.json({ error: 'Cannot remove the last active administrator.' }, { status: 403 });
      }
    }

    // 3. Return clear result if already removed
    if (targetUser.status === 'removed') {
      return NextResponse.json({
        success: true,
        alreadyRemoved: true,
        message: `Account "${targetUser.name}" has already been removed.`,
        user: targetUser
      }, { status: 200 });
    }

    const body = await request.json().catch(() => ({}));
    const { reason, confirmed } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'A removal reason is required.' }, { status: 400 });
    }
    if (!confirmed) {
      return NextResponse.json({ error: 'Explicit confirmation is required before removing an account.' }, { status: 400 });
    }

    const targetUserId = targetUser.id;

    // 4. Booking and refund checks for customer/provider
    let activeBookings = [];
    let pendingRefunds = [];
    if (targetUser.role === 'customer') {
      activeBookings = db.prepare(`
        SELECT id, booking_number, service_title, status
        FROM bookings
        WHERE customer_id = ?
          AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
      `).all(targetUserId);

      pendingRefunds = db.prepare(`
        SELECT id, booking_number
        FROM bookings
        WHERE customer_id = ?
          AND status IN ('declined', 'cancelled')
          AND booking_fee_status = 'paid'
      `).all(targetUserId);
    } else if (targetUser.role === 'provider') {
      activeBookings = db.prepare(`
        SELECT id, booking_number, service_title, status
        FROM bookings
        WHERE provider_id = ?
          AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
      `).all(targetUserId);

      pendingRefunds = db.prepare(`
        SELECT id, booking_number
        FROM bookings
        WHERE provider_id = ?
          AND status IN ('declined', 'cancelled')
          AND booking_fee_status = 'paid'
      `).all(targetUserId);
    }

    if (activeBookings.length > 0 || pendingRefunds.length > 0) {
      return NextResponse.json({
        error: `Cannot remove account while ${activeBookings.length} active booking(s) or ${pendingRefunds.length} pending refund(s) remain unresolved. Please resolve active bookings first.`,
        activeBookings,
        pendingRefunds
      }, { status: 409 });
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      // Cancel recurring subscription if provider
      if (targetUser.role === 'provider') {
        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'cancelled', auto_renew = 0, cancelled_at = ?, updated_at = ?
          WHERE provider_id = ?
        `).run(now, now, targetUserId);
      }

      // Cancel pending transactions
      db.prepare(`
        UPDATE transactions
        SET status = 'failed', updated_at = ?
        WHERE user_id = ? AND status = 'pending'
      `).run(now, targetUserId);

      // Recoverable removal: set status = 'removed', revoke sessions
      db.prepare(`
        UPDATE users
        SET status = 'removed',
            removal_reason = ?,
            removed_at = ?,
            removed_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ?
      `).run(reason.trim(), now, auth.user.id, targetUserId);
    })();

    logAccountAction({
      targetUserId,
      targetUserName: targetUser.name,
      targetUserEmail: targetUser.email,
      targetUserRole: targetUser.role,
      action: 'remove_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: reason.trim()
    });

    createNotification(
      targetUserId,
      'account',
      'Account Removed',
      'Your Jobzy account has been deactivated and removed by administration.',
      '/contact'
    );

    try {
      syncRowToSupabase(db, 'users', targetUserId);
    } catch (syncErr) {
      console.error('Supabase sync error on user remove:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Account "${targetUser.name}" has been removed (recoverable). All historical records have been preserved.`
    });
  } catch (err) {
    console.error('Error removing user account:', err);
    return NextResponse.json({ error: err.message || 'Failed to remove user account.' }, { status: 500 });
  }
}

