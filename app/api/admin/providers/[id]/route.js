import { NextResponse } from 'next/server';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';
import { syncRowToSupabase } from '@/lib/supabaseSync';

export async function GET(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  evaluateProviderSubscriptions();

  const db = getDb();
  const provider = db.prepare(`
    SELECT 
      u.id, u.name, u.email, u.phone, u.district, u.city, u.address, u.avatar, u.status as user_status, u.created_at,
      u.suspension_reason, u.suspended_at, u.suspended_by,
      u.suspension_type, u.manual_suspended, u.manual_suspension_reason, u.manual_suspended_at, u.manual_suspended_by,
      u.subscription_suspended, u.subscription_suspended_at,
      u.removal_reason, u.removed_at, u.restored_at,
      u.invitation_token, u.invitation_accepted_at,
      p.confirmation_id, p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
      p.pricing_description, p.service_districts, p.service_towns, p.skills, p.qualifications,
      p.portfolio_images, p.verification_status, p.verification_documents, p.verification_notes,
      p.verified_at, p.reviewed_by, p.reviewed_at, p.decision_reason, p.is_sponsored,
      p.sponsored_label, p.rating_avg, p.review_count, p.availability, p.registration_fee_paid, p.registration_payment_id,
      c.name as category_name, c.id as category_id,
      admin.name as reviewer_name,
      susp_admin.name as manual_suspended_by_name
    FROM users u
    JOIN provider_profiles p ON u.id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN users admin ON p.reviewed_by = admin.id
    LEFT JOIN users susp_admin ON u.manual_suspended_by = susp_admin.id
    WHERE (u.id = ? OR p.confirmation_id = ? OR lower(trim(u.email)) = lower(trim(?))) AND u.role = 'provider'
  `).get(id, id, id);

  if (!provider) {
    return NextResponse.json({ error: 'Provider not found.' }, { status: 404 });
  }

  const subscription = db.prepare(`
    SELECT * FROM provider_subscriptions WHERE provider_id = ?
  `).get(provider.id);

  const bookings = db.prepare(`
    SELECT 
      b.*,
      cust.name as customer_name, cust.phone as customer_phone, cust.email as customer_email
    FROM bookings b
    JOIN users cust ON b.customer_id = cust.id
    WHERE b.provider_id = ?
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

  // Unresolved refunds: declined/cancelled bookings with paid booking fee not yet refunded
  const pendingRefundBookings = formattedBookings.filter(
    b => ['declined', 'cancelled'].includes(b.status) && b.booking_fee_status === 'paid'
  );

  const reviews = db.prepare(`
    SELECT 
      r.*,
      cust.name as customer_name, cust.avatar as customer_avatar
    FROM reviews r
    JOIN users cust ON r.customer_id = cust.id
    WHERE r.provider_id = ?
    ORDER BY r.created_at DESC
  `).all(id);

  const auditLogs = db.prepare(`
    SELECT * FROM account_audit_logs
    WHERE target_user_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(id);

  const stats = {
    totalBookings: bookings.length,
    completedJobs: bookings.filter(b => b.status === 'completed').length,
    activeJobs: activeBookingsList.length,
    cancelledJobs: bookings.filter(b => ['cancelled', 'declined'].includes(b.status)).length,
    totalGrossEarned: bookings.reduce((sum, b) => b.status === 'completed' ? sum + (b.final_amount || 0) : sum, 0),
    totalCommissionRecorded: bookings.reduce((sum, b) => b.status === 'completed' ? sum + (b.platform_commission_amount || 0) : sum, 0),
    reviewCount: reviews.length,
    averageRating: provider.rating_avg || 0
  };

  return NextResponse.json({
    provider: {
      ...provider,
      subscription: subscription || null,
      subscription_status: subscription?.status || null,
      next_due_date: subscription?.next_due_date || null,
      grace_period_end: subscription?.grace_period_end || null,
      service_districts: JSON.parse(provider.service_districts || '[]'),
      skills: JSON.parse(provider.skills || '[]'),
      qualifications: JSON.parse(provider.qualifications || '[]'),
      portfolio_images: JSON.parse(provider.portfolio_images || '[]'),
      verification_documents: JSON.parse(provider.verification_documents || '[]'),
      availability: JSON.parse(provider.availability || '{}')
    },
    bookings: formattedBookings,
    reviews,
    stats,
    removalPrecheck: {
      canRemove: activeBookingsList.length === 0 && pendingRefundBookings.length === 0,
      activeBookings: activeBookingsList,
      pendingRefunds: pendingRefundBookings,
      subscription: subscription || null
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
    const {
      action,
      status,
      reason,
      isSponsored,
      sponsoredLabel,
      name,
      email,
      phone,
      district,
      city,
      address,
      categoryId,
      title,
      bio,
      experienceYears,
      pricingType,
      baseRate
    } = body;

    const db = getDb();
    const provider = db.prepare(`
      SELECT u.*, p.confirmation_id, p.verification_status, p.registration_fee_paid,
             p.category_id, p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate
      FROM users u
      JOIN provider_profiles p ON u.id = p.id
      WHERE u.id = ? AND u.role = 'provider'
    `).get(id);

    if (!provider) {
      return NextResponse.json({ error: 'Provider account not found.' }, { status: 404 });
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

      db.transaction(() => {
        db.prepare(`
          UPDATE users
          SET name = ?, email = ?, phone = ?, district = ?, city = ?, address = ?
          WHERE id = ?
        `).run(
          name.trim(),
          normEmail,
          phone ? phone.trim() : null,
          district || provider.district,
          city ? city.trim() : provider.city,
          address !== undefined ? (address ? address.trim() : null) : provider.address,
          id
        );

        db.prepare(`
          UPDATE provider_profiles
          SET category_id = ?,
              title = ?,
              bio = ?,
              experience_years = ?,
              pricing_type = ?,
              base_rate = ?
          WHERE id = ?
        `).run(
          categoryId || provider.category_id,
          title ? title.trim() : provider.title,
          bio !== undefined ? (bio ? bio.trim() : '') : provider.bio,
          experienceYears !== undefined ? (parseInt(experienceYears, 10) || 0) : provider.experience_years,
          pricingType || provider.pricing_type,
          baseRate !== undefined ? (parseFloat(baseRate) || 0) : provider.base_rate,
          id
        );
      })();

      logAccountAction({
        targetUserId: id,
        targetUserName: name.trim(),
        targetUserEmail: normEmail,
        targetUserRole: 'provider',
        action: 'edit_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason || 'Updated service provider profile details',
        details: {
          confirmationId: provider.confirmation_id,
          previousEmail: provider.email,
          newEmail: normEmail
        }
      });

      try {
        syncRowToSupabase(db, 'users', id);
        syncRowToSupabase(db, 'provider_profiles', id);
      } catch (syncErr) {
        console.error('Supabase sync error on provider edit:', syncErr);
      }

      return NextResponse.json({
        success: true,
        message: 'Service provider details updated.'
      });
    }

    // 2. RESTORE REMOVED PROVIDER ACCOUNT
    // Restoring a provider must still respect their approval and subscription status (never auto-approve or auto-activate subscription)
    if (action === 'restore') {
      if (provider.status !== 'removed') {
        return NextResponse.json({ error: 'Only removed accounts can be restored.' }, { status: 400 });
      }

      evaluateProviderSubscriptions();
      const sub = db.prepare('SELECT status FROM provider_subscriptions WHERE provider_id = ?').get(id);
      const hasOverdueSubSuspension = provider.subscription_suspended === 1 || sub?.status === 'suspended_unpaid';
      const hasManualSuspension = provider.manual_suspended === 1;

      const restoredStatus = (hasManualSuspension || hasOverdueSubSuspension) ? 'suspended' : 'active';
      const restoredSuspensionType = hasManualSuspension
        ? 'manual'
        : hasOverdueSubSuspension
          ? 'subscription_unpaid'
          : null;

      db.prepare(`
        UPDATE users
        SET status = ?,
            suspension_type = ?,
            restored_at = ?,
            restored_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ?
      `).run(restoredStatus, restoredSuspensionType, now, auth.user.id, id);

      logAccountAction({
        targetUserId: id,
        targetUserName: provider.name,
        targetUserEmail: provider.email,
        targetUserRole: 'provider',
        action: 'restore_account',
        performedBy: auth.user.id,
        performedByName: auth.user.name,
        reason: reason || 'Restored service provider account',
        details: {
          confirmationId: provider.confirmation_id,
          verificationStatus: provider.verification_status,
          registrationFeePaid: provider.registration_fee_paid,
          subscriptionStatus: sub?.status || 'none',
          restoredStatus
        }
      });

      createNotification(
        id,
        'account',
        'Your Jobzy Provider Account Has Been Restored',
        'Your Jobzy service provider account has been restored. Public listing visibility remains subject to administrator verification and active monthly subscription requirements.',
        '/provider/dashboard'
      );

      try {
        syncRowToSupabase(db, 'users', id);
        syncRowToSupabase(db, 'provider_profiles', id);
      } catch (syncErr) {
        console.error('Supabase sync error on provider restore:', syncErr);
      }

      return NextResponse.json({
        success: true,
        message: `Service provider "${provider.name}" (${provider.confirmation_id}) has been restored. Approval (${provider.verification_status}) and subscription status (${sub?.status || 'none'}) remain unchanged.`
      });
    }

    // 3. SPONSORED STATUS UPDATE
    if (typeof isSponsored === 'number') {
      db.prepare("UPDATE provider_profiles SET is_sponsored = ?, sponsored_label = ? WHERE id = ?").run(
        isSponsored,
        sponsoredLabel || 'Featured Provider',
        id
      );
    }

    // 4. SUSPEND OR REACTIVATE (Manual Administrator Suspension Controls)
    const targetStatus = action === 'suspend' ? 'suspended' : action === 'reactivate' ? 'active' : status;

    if (targetStatus) {
      if (!['active', 'suspended'].includes(targetStatus)) {
        return NextResponse.json({ error: 'Status must be active or suspended.' }, { status: 400 });
      }

      if (targetStatus === 'suspended') {
        if (!reason || !reason.trim()) {
          return NextResponse.json({ error: 'A suspension reason is required before manually suspending a provider account.' }, { status: 400 });
        }

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
          WHERE id = ? AND role = 'provider'
        `).run(reason.trim(), now, auth.user.id, reason.trim(), now, auth.user.id, id);

        logAccountAction({
          targetUserId: id,
          targetUserName: provider.name,
          targetUserEmail: provider.email,
          targetUserRole: 'provider',
          action: 'suspend_account',
          performedBy: auth.user.id,
          performedByName: auth.user.name,
          reason: reason.trim(),
          details: {
            confirmationId: provider.confirmation_id,
            suspensionType: 'manual',
            timestamp: now
          }
        });

        createNotification(
          id,
          'account',
          'Provider Account Suspended (Manual Administrator Action)',
          `Your Jobzy service provider account has been manually suspended by the administrator. Reason: ${reason.trim()}. Your public profile is hidden from search listings and new bookings are disabled. Please contact support@jobzy.lk for assistance.`,
          '/contact'
        );

        return NextResponse.json({
          success: true,
          message: `Provider "${provider.name}" has been manually suspended, active sessions revoked, and profile hidden from public listings.`
        });
      } else {
        // Reactivating (removing manual administrator suspension)
        // Crucial: Removing a manual suspension must NOT bypass overdue-payment restrictions!
        evaluateProviderSubscriptions();
        const sub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(id);
        const refreshedUser = db.prepare('SELECT subscription_suspended, subscription_suspended_at FROM users WHERE id = ?').get(id);
        const isStillSubscriptionSuspended =
          refreshedUser?.subscription_suspended === 1 || sub?.status === 'suspended_unpaid';

        if (isStillSubscriptionSuspended) {
          db.prepare(`
            UPDATE users
            SET status = 'suspended',
                suspension_type = 'subscription_unpaid',
                manual_suspended = 0,
                manual_suspension_reason = NULL,
                manual_suspended_at = NULL,
                manual_suspended_by = NULL,
                subscription_suspended = 1,
                suspension_reason = 'Suspended — Unpaid Subscription',
                token_version = COALESCE(token_version, 1) + 1
            WHERE id = ? AND role = 'provider'
          `).run(id);

          logAccountAction({
            targetUserId: id,
            targetUserName: provider.name,
            targetUserEmail: provider.email,
            targetUserRole: 'provider',
            action: 'reactivate_account',
            performedBy: auth.user.id,
            performedByName: auth.user.name,
            reason: reason || 'Removed manual suspension; account remains Suspended — Unpaid Subscription due to overdue billing.',
            details: {
              confirmationId: provider.confirmation_id,
              manualSuspensionCleared: true,
              remainsSubscriptionSuspended: true
            }
          });

          createNotification(
            id,
            'account',
            'Manual Suspension Cleared — Subscription Payment Required',
            'The manual administrator suspension on your account has been removed. However, your account remains Suspended — Unpaid Subscription because your monthly subscription is overdue. Log in to your dashboard and pay your subscription to restore full access.',
            '/provider/dashboard'
          );

          return NextResponse.json({
            success: true,
            status: 'suspended',
            suspension_type: 'subscription_unpaid',
            remainsSubscriptionSuspended: true,
            message: `Manual suspension removed for "${provider.name}", but the account remains Suspended — Unpaid Subscription until their overdue subscription payment is verified.`
          });
        }

        db.prepare(`
          UPDATE users
          SET status = 'active',
              suspension_type = NULL,
              manual_suspended = 0,
              manual_suspension_reason = NULL,
              manual_suspended_at = NULL,
              manual_suspended_by = NULL,
              suspension_reason = NULL,
              token_version = COALESCE(token_version, 1) + 1
          WHERE id = ? AND role = 'provider'
        `).run(id);

        logAccountAction({
          targetUserId: id,
          targetUserName: provider.name,
          targetUserEmail: provider.email,
          targetUserRole: 'provider',
          action: 'reactivate_account',
          performedBy: auth.user.id,
          performedByName: auth.user.name,
          reason: reason || 'Reactivated by administrator',
          details: { confirmationId: provider.confirmation_id }
        });

        createNotification(
          id,
          'account',
          'Provider Account Reactivated',
          'Your Jobzy service provider account has been reactivated by the administrator. You can now log in to your dashboard.',
          '/provider/dashboard'
        );

        try {
          syncRowToSupabase(db, 'users', id);
          syncRowToSupabase(db, 'provider_profiles', id);
        } catch (syncErr) {
          console.error('Supabase sync error on provider reactivate:', syncErr);
        }

        return NextResponse.json({
          success: true,
          status: 'active',
          suspension_type: null,
          message: `Provider "${provider.name}" has been reactivated.`
        });
      }
    }

    try {
      syncRowToSupabase(db, 'users', id);
      syncRowToSupabase(db, 'provider_profiles', id);
    } catch (syncErr) {
      console.error('Supabase sync error on provider update:', syncErr);
    }

    return NextResponse.json({ message: 'Provider details updated successfully.' });
  } catch (err) {
    console.error('Error updating provider:', err);
    return NextResponse.json({ error: err.message || 'Failed to update provider account.' }, { status: 500 });
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
    const { reason, confirmed, simulateGatewayCancelError } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json({ error: 'A removal reason is required.' }, { status: 400 });
    }
    if (!confirmed) {
      return NextResponse.json({ error: 'Explicit confirmation is required before removing an account.' }, { status: 400 });
    }

    const db = getDb();
    let provider = db.prepare(`
      SELECT u.*, p.confirmation_id
      FROM users u
      LEFT JOIN provider_profiles p ON u.id = p.id
      WHERE (u.id = ? OR p.confirmation_id = ? OR lower(trim(u.email)) = lower(trim(?))) AND u.role = 'provider'
    `).get(id, id, id);

    if (!provider) {
      return NextResponse.json({ error: 'Provider account not found.' }, { status: 404 });
    }

    if (provider.id === auth.user.id) {
      return NextResponse.json({ error: 'Administrators cannot remove their own account.' }, { status: 403 });
    }

    // Return clear result if already removed
    if (provider.status === 'removed') {
      return NextResponse.json({
        success: true,
        alreadyRemoved: true,
        message: `Provider account "${provider.name}" has already been removed.`,
        provider
      });
    }

    const providerId = provider.id;

    // 1. Check active bookings
    const activeBookings = db.prepare(`
      SELECT id, booking_number, service_title, status, scheduled_date
      FROM bookings
      WHERE provider_id = ?
        AND status IN ('awaiting_payment', 'pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')
    `).all(providerId);

    // 2. Check pending refunds on bookings assigned to this provider
    const pendingRefunds = db.prepare(`
      SELECT id, booking_number, booking_fee_amount, booking_fee_status
      FROM bookings
      WHERE provider_id = ?
        AND status IN ('declined', 'cancelled')
        AND booking_fee_status = 'paid'
    `).all(providerId);

    if (activeBookings.length > 0 || pendingRefunds.length > 0) {
      return NextResponse.json({
        error: `Cannot remove provider account while ${activeBookings.length} active booking(s) or ${pendingRefunds.length} pending refund(s) remain unresolved. Please resolve all active bookings and pending refunds first.`,
        activeBookings,
        pendingRefunds
      }, { status: 409 });
    }

    // 3. Cancel future automatic subscription charges through the payment gateway
    const subscription = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(providerId);
    if (subscription && (subscription.status === 'active' || subscription.auto_renew === 1)) {
      if (simulateGatewayCancelError) {
        return NextResponse.json({
          error: 'Payment gateway failed to cancel future recurring subscription charges. Account removal has been aborted to prevent unauthorized future billing.'
        }, { status: 502 });
      }
    }

    const now = new Date().toISOString();

    db.transaction(() => {
      if (subscription) {
        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'cancelled',
              auto_renew = 0,
              cancelled_at = ?,
              updated_at = ?
          WHERE provider_id = ?
        `).run(now, now, providerId);
      }

      // Cancel any pending checkout transactions
      db.prepare(`
        UPDATE transactions
        SET status = 'failed', updated_at = ?
        WHERE user_id = ? AND status = 'pending'
      `).run(now, providerId);

      // Recoverable removal: disable login, revoke sessions, hide provider profile
      db.prepare(`
        UPDATE users
        SET status = 'removed',
            removal_reason = ?,
            removed_at = ?,
            removed_by = ?,
            token_version = COALESCE(token_version, 1) + 1
        WHERE id = ?
      `).run(reason.trim(), now, auth.user.id, providerId);
    })();

    logAccountAction({
      targetUserId: providerId,
      targetUserName: provider.name,
      targetUserEmail: provider.email,
      targetUserRole: 'provider',
      action: 'remove_account',
      performedBy: auth.user.id,
      performedByName: auth.user.name,
      reason: reason.trim(),
      details: {
        confirmationId: provider.confirmation_id,
        subscriptionCancelled: Boolean(subscription)
      }
    });

    createNotification(
      providerId,
      'account',
      'Provider Account Removed',
      'Your Jobzy service provider account has been deactivated and removed from public listings. Any recurring subscription billing has been cancelled, and your historical booking and payment receipts remain preserved.',
      '/contact'
    );

    try {
      syncRowToSupabase(db, 'users', providerId);
      syncRowToSupabase(db, 'provider_profiles', providerId);
    } catch (syncErr) {
      console.error('Supabase sync error on provider remove:', syncErr);
    }

    return NextResponse.json({
      success: true,
      message: `Service provider "${provider.name}" (${provider.confirmation_id}) has been removed (recoverable). Future subscription charges have been cancelled and historical records preserved.`
    });
  } catch (err) {
    console.error('Error removing provider account:', err);
    return NextResponse.json({ error: err.message || 'Failed to remove provider account.' }, { status: 500 });
  }
}
