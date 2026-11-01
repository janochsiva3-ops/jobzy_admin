import { NextResponse } from 'next/server';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  let customer = db.prepare(`
    SELECT id, name, email, phone, district, city, address, avatar, status, created_at,
           suspension_reason, suspended_at, removal_reason, removed_at, restored_at,
           invitation_token, invitation_accepted_at
    FROM users
    WHERE (id = ? OR lower(trim(email)) = lower(trim(?))) AND role = 'customer'
  `).get(id, id);

  if (!customer) {
    return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
  }

  const bookings = db.prepare(`
    SELECT 
      b.*,
      prov.name as provider_name, prov.phone as provider_phone,
      p.title as provider_title, p.confirmation_id as provider_confirmation_id
    FROM bookings b
    JOIN users prov ON b.provider_id = prov.id
    JOIN provider_profiles p ON b.provider_id = p.id
    WHERE b.customer_id = ?
    ORDER BY b.created_at DESC
  `).all(id);

  const formattedBookings = bookings.map(b => ({
    ...b,
    attachments: JSON.parse(b.attachments || '[]'),
    quote_details: b.quote_details ? JSON.parse(b.quote_details) : null
  }));

  const activeBookingsList = formattedBookings.filter(b =>
    ['awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion'].includes(b.status)
  );

  // Unresolved refunds: cancelled/declined bookings where booking_fee_status is still 'paid', or pending transactions
  const pendingRefundBookings = formattedBookings.filter(
    b => ['declined', 'cancelled'].includes(b.status) && b.booking_fee_status === 'paid'
  );
  const pendingTransactions = db.prepare(`
    SELECT id, transaction_reference, fee_type, amount, status, created_at
    FROM transactions
    WHERE user_id = ? AND status = 'pending'
  `).all(id);

  const auditLogs = db.prepare(`
    SELECT * FROM account_audit_logs
    WHERE target_user_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(id);

  const stats = {
    totalBookings: bookings.length,
    activeBookings: activeBookingsList.length,
    completedBookings: bookings.filter(b => b.status === 'completed').length,
    cancelledBookings: bookings.filter(b => ['cancelled', 'declined'].includes(b.status)).length,
    totalSpent: bookings.reduce((sum, b) => b.status === 'completed' ? sum + (b.final_amount || 0) : sum, 0)
  };

  return NextResponse.json({
    customer,
    bookings: formattedBookings,
    stats,
    removalPrecheck: {
      canRemove: activeBookingsList.length === 0 && pendingRefundBookings.length === 0,
      activeBookings: activeBookingsList,
      pendingRefunds: pendingRefundBookings,
      pendingTransactions
    },
    auditLogs
  });
}

export async function PUT(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { action, status, reason, name, email, phone, district, city, address } = body;

    const db = getDb();
    const customer = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'customer'").get(id);
    if (!customer) {
      return NextResponse.json({ error: 'Customer account not found.' }, { status: 404 });
    }

    const now = new Date().toISOString();

    // 1. EDIT DETAILS
    if (action === 'edit') {
      if (!name || !name.trim() || !email || !email.trim()) {
        return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 });
      }
      const normEmail = email.toLowerCase().trim();
      const dupEmail = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(normEmail, id);
      if (dupEmail) {
        return NextResponse.json({ error: 'Another account is already using this email address.' }, { status: 409 });
      }
      if (phone && phone.trim()) {
        const dupPhone = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone.trim(), id);
        if (dupPhone) {
          return NextResponse.json({ error: 'Another account is already using this phone number.' }, { status: 409 });
        }
      }

      db.prepare(`
        UPDATE users
        SET name = ?, email = ?, phone = ?, district = ?, city = ?, address = ?
        WHERE id = ?
      `).run(
        name.trim(),
        normEmail,
        phone ? phone.trim() : null,
        district || customer.district,
        city ? city.trim() : customer.city,
        address !== undefined ? (address ? address.trim() : null) : customer.address,
        id
      );

      logAccountAction({
        targetUserId: id,
        targetUserName: name.trim(),
        targetUserEmail: normEmail,
        targetUserRole: 'customer',
        action: 'edit_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason || 'Updated customer profile details',
        details: { previousEmail: customer.email, newEmail: normEmail }
      });

      return NextResponse.json({
        success: true,
        message: 'Customer profile details updated.'
      });
    }

    // 2. RESTORE REMOVED ACCOUNT
    if (action === 'restore') {
      if (customer.status !== 'removed') {
        return NextResponse.json({ error: 'Only removed accounts can be restored.' }, { status: 400 });
      }

      db.prepare(`
        UPDATE users
        SET status = 'active',
            restored_at = ?,
            restored_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ?
      `).run(now, auth.user.id, id);

      logAccountAction({
        targetUserId: id,
        targetUserName: customer.name,
        targetUserEmail: customer.email,
        targetUserRole: 'customer',
        action: 'restore_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason || 'Restored customer account to active status'
      });

      createNotification(
        id,
        'account',
        'Your Jobzy Account Has Been Restored',
        'Your Jobzy customer account has been restored and is now active. You may log in to access your bookings and receipts.',
        '/customer/dashboard'
      );

      return NextResponse.json({
        success: true,
        message: `Customer account (${customer.name}) has been restored to active status.`
      });
    }

    // 3. SUSPEND OR REACTIVATE
    const targetStatus = action === 'suspend' ? 'suspended' : action === 'reactivate' ? 'active' : status;

    if (!targetStatus || !['active', 'suspended'].includes(targetStatus)) {
      return NextResponse.json({ error: 'Valid status (active or suspended) is required.' }, { status: 400 });
    }

    if (targetStatus === 'suspended') {
      if (!reason || !reason.trim()) {
        return NextResponse.json({ error: 'A suspension reason is required before suspending an account.' }, { status: 400 });
      }

      db.prepare(`
        UPDATE users
        SET status = 'suspended',
            suspension_reason = ?,
            suspended_at = ?,
            suspended_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ? AND role = 'customer'
      `).run(reason.trim(), now, auth.user.id, id);

      logAccountAction({
        targetUserId: id,
        targetUserName: customer.name,
        targetUserEmail: customer.email,
        targetUserRole: 'customer',
        action: 'suspend_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason.trim()
      });

      // Notify user without exposing internal administrator notes
      createNotification(
        id,
        'account',
        'Account Suspended',
        'Your Jobzy customer account has been temporarily suspended. Active sessions have been signed out and new bookings are disabled. Please contact support@jobzy.lk for assistance.',
        '/contact'
      );

      return NextResponse.json({
        success: true,
        message: `Customer "${customer.name}" has been suspended and active sessions have been revoked.`
      });
    } else {
      db.prepare(`
        UPDATE users
        SET status = 'active',
            suspension_reason = NULL,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ? AND role = 'customer'
      `).run(id);

      logAccountAction({
        targetUserId: id,
        targetUserName: customer.name,
        targetUserEmail: customer.email,
        targetUserRole: 'customer',
        action: 'reactivate_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason || 'Reactivated by administrator'
      });

      createNotification(
        id,
        'account',
        'Account Reactivated',
        'Your Jobzy customer account has been reactivated. You can now log in and place service bookings.',
        '/customer/dashboard'
      );

      return NextResponse.json({
        success: true,
        message: `Customer "${customer.name}" has been reactivated.`
      });
    }
  } catch (err) {
    console.error('Error updating customer:', err);
    return NextResponse.json({ error: err.message || 'Failed to update customer account.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    if (id === auth.user.id) {
      return NextResponse.json({ error: 'Administrators cannot remove their own account.' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { reason, confirmed } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'A removal reason is required.' }, { status: 400 });
    }
    if (!confirmed) {
      return NextResponse.json({ error: 'Explicit confirmation is required before removing an account.' }, { status: 400 });
    }

    const db = getDb();
    let customer = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'customer'").get(id);
    if (!customer) {
      customer = db.prepare("SELECT * FROM users WHERE lower(trim(email)) = lower(trim(?)) AND role = 'customer'").get(id);
    }
    if (!customer) {
      return NextResponse.json({ error: 'Customer account not found.' }, { status: 404 });
    }

    if (customer.id === auth.user.id) {
      return NextResponse.json({ error: 'Administrators cannot remove their own account.' }, { status: 403 });
    }

    // Return clear result if already removed
    if (customer.status === 'removed') {
      return NextResponse.json({
        success: true,
        alreadyRemoved: true,
        message: `Customer account "${customer.name}" has already been removed.`,
        customer
      });
    }

    const customerId = customer.id;

    // Check active bookings
    const activeBookings = db.prepare(`
      SELECT id, booking_number, service_title, status, scheduled_date
      FROM bookings
      WHERE customer_id = ?
        AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
    `).all(customerId);

    // Check pending refunds (declined/cancelled bookings with paid booking fee not yet refunded)
    const pendingRefunds = db.prepare(`
      SELECT id, booking_number, booking_fee_amount, booking_fee_status
      FROM bookings
      WHERE customer_id = ?
        AND status IN ('declined', 'cancelled')
        AND booking_fee_status = 'paid'
    `).all(customerId);

    if (activeBookings.length > 0 || pendingRefunds.length > 0) {
      return NextResponse.json({
        error: `Cannot remove account while ${activeBookings.length} active booking(s) or ${pendingRefunds.length} pending refund(s) remain unresolved. Please cancel/complete active bookings and process pending refunds first.`,
        activeBookings,
        pendingRefunds
      }, { status: 409 });
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      // Cancel any abandoned awaiting_payment / pending transaction records
      db.prepare(`
        UPDATE transactions
        SET status = 'failed', updated_at = ?
        WHERE user_id = ? AND status = 'pending'
      `).run(now, customerId);

      // Recoverable removal: disable login, revoke sessions, preserve bookings/payments/receipts
      db.prepare(`
        UPDATE users
        SET status = 'removed',
            removal_reason = ?,
            removed_at = ?,
            removed_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ?
      `).run(reason.trim(), now, auth.user.id, customerId);
    })();

    logAccountAction({
      targetUserId: customerId,
      targetUserName: customer.name,
      targetUserEmail: customer.email,
      targetUserRole: 'customer',
      action: 'remove_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: reason.trim()
    });

    createNotification(
      customerId,
      'account',
      'Account Removed',
      'Your Jobzy account has been deactivated and removed from active service. Historical booking and payment receipts remain preserved in accordance with platform policy.',
      '/contact'
    );

    return NextResponse.json({
      success: true,
      message: `Customer account "${customer.name}" has been removed (recoverable). All historical bookings, payments, and receipts have been preserved.`
    });
  } catch (err) {
    console.error('Error removing customer account:', err);
    return NextResponse.json({ error: err.message || 'Failed to remove customer account.' }, { status: 500 });
  }
}
