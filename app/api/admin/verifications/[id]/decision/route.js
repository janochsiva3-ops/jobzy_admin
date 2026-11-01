import { NextResponse } from 'next/server';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getActiveFeeSetting } from '@/lib/paymentService';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const decision = body.decision || body.action;
  const notes = body.notes;
  const validDecisions = ['approved', 'rejected', 'request_changes', 'suspended'];
  if (!validDecisions.includes(decision)) {
    return NextResponse.json({ error: 'Decision must be approved, rejected, request_changes, or suspended.' }, { status: 400 });
  }

  if ((decision === 'rejected' || decision === 'request_changes' || decision === 'suspended') && (!notes || !notes.trim())) {
    return NextResponse.json({
      error: decision === 'rejected'
        ? 'A rejection reason is required.'
        : decision === 'suspended'
        ? 'A suspension reason is required.'
        : 'Please specify which information or documents need to be corrected.'
    }, { status: 400 });
  }

  const db = getDb();
  const provider = db.prepare(`
    SELECT p.*, u.name, u.email, u.status as user_status, u.manual_suspended, u.subscription_suspended
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    WHERE p.id = ?
  `).get(id);

  if (!provider) {
    return NextResponse.json({ error: 'Provider profile not found.' }, { status: 404 });
  }

  // Strictly enforce verified registration fee payment before allowing approval
  if (decision === 'approved') {
    const verifiedRegTxn = db.prepare(`
      SELECT id, status FROM transactions
      WHERE user_id = ? AND fee_type = 'provider_registration' AND status = 'successful'
      LIMIT 1
    `).get(id);

    if (!provider.registration_fee_paid || (!verifiedRegTxn && provider.registration_payment_id)) {
      return NextResponse.json({
        error: 'Cannot approve provider application before the one-time registration fee payment is verified on the server.'
      }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const statusValue = decision === 'request_changes' ? 'changes_requested' : decision;

  db.prepare(`
    UPDATE provider_profiles
    SET verification_status = ?,
        verification_notes = ?,
        verified_at = ?,
        reviewed_by = ?,
        reviewed_at = ?,
        decision_reason = ?
    WHERE id = ?
  `).run(
    statusValue,
    notes ? notes.trim() : `Status marked as ${statusValue} by administrator.`,
    decision === 'approved' ? now : null,
    auth.user.id,
    now,
    notes ? notes.trim() : null,
    id
  );

  if (decision === 'approved') {
    // Only set user status to active if not manually suspended or subscription-suspended
    if (!provider.manual_suspended && !provider.subscription_suspended) {
      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(id);
    }

    // Ensure a provider_subscriptions row exists. If none exists yet, create it as 'pending'
    // so the provider must pay their first monthly subscription before public listing & bookings.
    const existingSub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(id);
    if (!existingSub) {
      const subFee = getActiveFeeSetting('provider_subscription');
      db.prepare(`
        INSERT INTO provider_subscriptions (
          id, provider_id, status, monthly_fee, fee_version, auto_renew, grace_period_days, created_at, updated_at
        ) VALUES (?, ?, 'pending', ?, ?, 0, 5, ?, ?)
      `).run(
        `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        id,
        subFee?.amount || 1500,
        subFee?.version || 1,
        now,
        now
      );
    }
  } else if (decision === 'suspended') {
    db.prepare(`
      UPDATE users
      SET status = 'suspended',
          suspension_type = 'manual',
          manual_suspended = 1,
          manual_suspension_reason = ?,
          manual_suspended_at = ?,
          manual_suspended_by = ?,
          suspension_reason = ?,
          suspended_at = ?,
          suspended_by = ?,
          token_version = COALESCE(token_version, 1) + 1
      WHERE id = ?
    `).run(notes.trim(), now, auth.user.id, notes.trim(), now, auth.user.id, id);

    logAccountAction({
      targetUserId: id,
      targetUserName: provider.name,
      targetUserEmail: provider.email,
      targetUserRole: 'provider',
      action: 'suspend_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: notes.trim(),
      details: {
        suspensionType: 'manual',
        confirmationId: provider.confirmation_id
      }
    });
  }

  let notifTitle = 'Provider Application Update';
  let notifMessage = '';

  if (decision === 'approved') {
    const subRow = db.prepare('SELECT status FROM provider_subscriptions WHERE provider_id = ?').get(id);
    const needsFirstSub = !subRow || subRow.status === 'pending';
    notifTitle = 'Provider Registration Approved!';
    notifMessage = needsFirstSub
      ? 'Congratulations! Your Jobzy provider application has been approved by the administrator. Please complete your first monthly subscription payment in Billing & Subscription to activate your public listing and start receiving bookings.'
      : 'Congratulations! Your Jobzy professional profile has been approved and activated. You are now live in search results and can receive customer booking requests.';
  } else if (decision === 'rejected') {
    notifTitle = 'Provider Registration Rejected';
    notifMessage = `Your service provider application was rejected. Reason: ${notes.trim()}`;
  } else if (decision === 'request_changes') {
    notifTitle = 'Changes Requested on Your Application';
    notifMessage = `Action required: Please correct the following details and resubmit: ${notes.trim()}`;
  } else {
    notifTitle = 'Provider Account Suspended';
    notifMessage = `Your provider account has been manually suspended by the administrator. Reason: ${notes?.trim() || 'Contact support'}`;
  }

  createNotification(
    id,
    'verification',
    notifTitle,
    notifMessage,
    '/provider/dashboard'
  );

  return NextResponse.json({
    message: `Provider status updated to ${statusValue}.`,
    verification_status: statusValue
  });
}
