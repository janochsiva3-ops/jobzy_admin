import getDb, { createNotification, logAccountAction } from './db.js';
import { FIVE_DAYS_MS, computeFiveDayGraceDeadline, formatSriLankaDateTime } from './dateUtils.js';
import crypto from 'crypto';

/**
 * Calendar month calculation adhering strictly to calendar month billing
 * with defined fallback rules for dates such as the 31st.
 * Example:
 *   Jan 31 -> Feb 28 (or 29)
 *   Mar 31 -> Apr 30
 *   May 15 -> Jun 15
 */
export function addOneCalendarMonth(startDateStr) {
  const startDate = new Date(startDateStr);
  const targetDay = startDate.getUTCDate();
  const result = new Date(startDate);

  result.setUTCMonth(result.getUTCMonth() + 1);

  // If month rolled over more than 1 month (e.g. Jan 31 -> March in non-leap year)
  if (result.getUTCDate() !== targetDay) {
    result.setUTCDate(0); // Sets to last day of previous month
  }

  return result.toISOString();
}

/**
 * Generates a unique, permanent transaction reference
 * Format: TXN-YYYYMMDD-XXXXXX
 */
export function generateTransactionReference() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TXN-${year}${month}${day}-${rand}`;
}

/**
 * Fetch current fee configuration and active version
 */
export function getFeeSetting(feeType) {
  const db = getDb();
  return db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(feeType);
}

export const getActiveFeeSetting = getFeeSetting;

/**
 * Get all current fee settings
 */
export function getAllFeeSettings() {
  const db = getDb();
  return db.prepare('SELECT * FROM platform_fee_settings ORDER BY id ASC').all();
}

/**
 * Verifies PayHere webhook signature according to PayHere official specification:
 * hash = strtoupper(md5(merchant_id + order_id + payhere_amount + payhere_currency + status_code + strtoupper(md5(merchant_secret))))
 */
export function verifyPayHereSignature(params, merchantSecret) {
  const effectiveSecret = merchantSecret || process.env.PAYHERE_MERCHANT_SECRET || 'jobzy_payhere_sandbox_secret_2026';
  if (!effectiveSecret) return false;

  const {
    merchant_id,
    order_id,
    payhere_amount,
    payhere_currency,
    status_code,
    md5sig
  } = params;

  if (!merchant_id || !order_id || payhere_amount === undefined || !payhere_currency || status_code === undefined || !md5sig) {
    return false;
  }

  const hashedSecret = crypto.createHash('md5').update(effectiveSecret).digest('hex').toUpperCase();
  const formattedAmount = Number(payhere_amount).toFixed(2);
  const rawAmount = String(payhere_amount);
  const candidateAmounts = Array.from(new Set([formattedAmount, rawAmount]));

  for (const amt of candidateAmounts) {
    const source = `${merchant_id}${order_id}${amt}${payhere_currency}${status_code}${hashedSecret}`;
    const expectedSig = crypto.createHash('md5').update(source).digest('hex').toUpperCase();
    if (expectedSig === md5sig.toUpperCase()) {
      return true;
    }
  }

  return false;
}

/**
 * Computes the next billing period (start, end, graceEnd) for a provider's monthly subscription.
 */
export function calculateSubscriptionBillingPeriod(existingSub, nowIso = new Date().toISOString()) {
  const nowMs = new Date(nowIso).getTime();

  // If subscription is currently active and due date is still in the future,
  // the current period is already paid.
  if (
    existingSub &&
    existingSub.status === 'active' &&
    existingSub.current_period_end &&
    new Date(existingSub.current_period_end).getTime() > nowMs
  ) {
    return {
      alreadyPaidForCurrentPeriod: true,
      currentPeriodStart: existingSub.current_period_start,
      currentPeriodEnd: existingSub.current_period_end,
      periodStart: existingSub.current_period_end,
      periodEnd: addOneCalendarMonth(existingSub.current_period_end),
      gracePeriodEnd: computeFiveDayGraceDeadline(addOneCalendarMonth(existingSub.current_period_end))
    };
  }

  // If renewing during the 5-day grace period, keep billing cycle continuous from next_due_date
  // as long as adding 1 calendar month extends into the future.
  let periodStart = nowIso;
  if (existingSub && existingSub.next_due_date) {
    const dueMs = new Date(existingSub.next_due_date).getTime();
    const graceEndMs = existingSub.grace_period_end
      ? new Date(existingSub.grace_period_end).getTime()
      : dueMs + FIVE_DAYS_MS;

    if (nowMs >= dueMs && nowMs < graceEndMs) {
      const candidateEnd = addOneCalendarMonth(existingSub.next_due_date);
      if (new Date(candidateEnd).getTime() > nowMs) {
        periodStart = existingSub.next_due_date;
      }
    }
  }

  const periodEnd = addOneCalendarMonth(periodStart);
  const gracePeriodEnd = computeFiveDayGraceDeadline(periodEnd);

  return {
    alreadyPaidForCurrentPeriod: false,
    currentPeriodStart: existingSub?.current_period_start || null,
    currentPeriodEnd: existingSub?.current_period_end || null,
    periodStart,
    periodEnd,
    gracePeriodEnd
  };
}

/**
 * Evaluates all provider subscriptions on the server:
 * 1. Rechecks verified transactions before marking past_due or suspending.
 * 2. Marks unpaid due renewals as 'past_due' and starts the 5-day grace period.
 * 3. Sends overdue and pre-suspension reminders with Sri Lanka timestamps.
 * 4. Automatically suspends accounts ('Suspended — Unpaid Subscription') after 5 full days.
 */
export function evaluateProviderSubscriptions(nowOverride = null) {
  const db = getDb();
  const nowDate = nowOverride ? new Date(nowOverride) : new Date();
  const nowMs = nowDate.getTime();
  const nowIso = nowDate.toISOString();

  // Check if transition_date is configured for legacy approved providers without a subscription row
  const subSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = 'provider_subscription'").get();
  if (subSetting?.transition_date) {
    const transitionIso = new Date(subSetting.transition_date).toISOString();
    const legacyApproved = db.prepare(`
      SELECT u.id, u.name, u.email, u.created_at, p.confirmation_id
      FROM users u
      JOIN provider_profiles p ON u.id = p.id
      LEFT JOIN provider_subscriptions ps ON u.id = ps.provider_id
      WHERE u.role = 'provider'
        AND u.status != 'removed'
        AND p.verification_status = 'approved'
        AND ps.id IS NULL
        AND u.created_at < ?
    `).all(subSetting.transition_date);

    for (const lp of legacyApproved) {
      const subId = `sub-leg-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      const graceEnd = computeFiveDayGraceDeadline(transitionIso);
      db.prepare(`
        INSERT OR IGNORE INTO provider_subscriptions (
          id, provider_id, status, current_period_start, current_period_end,
          next_due_date, grace_period_days, grace_period_end, monthly_fee,
          fee_version, created_at, updated_at
        ) VALUES (?, ?, 'active', ?, ?, ?, 5, ?, ?, ?, ?, ?)
      `).run(
        subId,
        lp.id,
        lp.created_at,
        transitionIso,
        transitionIso,
        graceEnd,
        subSetting.amount || 1500,
        subSetting.version || 1,
        nowIso,
        nowIso
      );

      createNotification(
        lp.id,
        'subscription',
        'Subscription Transition Schedule Configured',
        `Your existing provider account has been assigned a subscription transition date of ${formatSriLankaDateTime(transitionIso, false)}. Monthly subscription billing (LKR ${(subSetting.amount || 1500).toLocaleString()}) will begin on that date.`,
        '/provider/dashboard'
      );
    }
  }

  const rows = db.prepare(`
    SELECT ps.*,
           u.name as provider_name,
           u.email as provider_email,
           u.status as user_status,
           u.suspension_type,
           u.manual_suspended,
           u.subscription_suspended,
           p.confirmation_id,
           p.verification_status
    FROM provider_subscriptions ps
    JOIN users u ON ps.provider_id = u.id
    JOIN provider_profiles p ON ps.provider_id = p.id
    WHERE u.status != 'removed'
  `).all();

  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin' AND status = 'active'").all();
  const changes = [];

  for (const sub of rows) {
    if (!sub.next_due_date || sub.status === 'pending' || sub.status === 'cancelled') {
      continue;
    }

    const dueMs = new Date(sub.next_due_date).getTime();
    if (isNaN(dueMs)) continue;

    // Always compute the exact 5-day grace deadline = next_due_date + 5 full days
    const expectedGraceEndIso = computeFiveDayGraceDeadline(sub.next_due_date);
    const graceEndMs = new Date(expectedGraceEndIso).getTime();

    if (sub.grace_period_days !== 5 || sub.grace_period_end !== expectedGraceEndIso) {
      db.prepare(`
        UPDATE provider_subscriptions
        SET grace_period_days = 5, grace_period_end = ?, updated_at = ?
        WHERE id = ?
      `).run(expectedGraceEndIso, nowIso, sub.id);
      sub.grace_period_days = 5;
      sub.grace_period_end = expectedGraceEndIso;
    }

    // Recheck payment status before marking past_due or suspending:
    // If a successful provider_subscription transaction exists after current_period_start that wasn't applied as last_payment_id
    if (nowMs >= dueMs) {
      const unappliedPaidTxn = db.prepare(`
        SELECT * FROM transactions
        WHERE user_id = ?
          AND fee_type = 'provider_subscription'
          AND status = 'successful'
          AND id != COALESCE(?, '')
          AND created_at >= COALESCE(?, '1970-01-01')
        ORDER BY updated_at DESC
        LIMIT 1
      `).get(sub.provider_id, sub.last_payment_id, sub.current_period_start);

      if (unappliedPaidTxn) {
        // Reconcile the already-succeeded payment instead of suspending!
        const reconciledStart = unappliedPaidTxn.billing_period_start || sub.next_due_date;
        const reconciledEnd = unappliedPaidTxn.billing_period_end || addOneCalendarMonth(reconciledStart);
        const reconciledGraceEnd = computeFiveDayGraceDeadline(reconciledEnd);

        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'active',
              current_period_start = ?,
              current_period_end = ?,
              next_due_date = ?,
              grace_period_days = 5,
              grace_period_end = ?,
              last_payment_id = ?,
              overdue_reminder_sent_at = NULL,
              pre_suspension_reminder_sent_at = NULL,
              suspension_notice_sent_at = NULL,
              updated_at = ?
          WHERE id = ?
        `).run(
          reconciledStart,
          reconciledEnd,
          reconciledEnd,
          reconciledGraceEnd,
          unappliedPaidTxn.id,
          nowIso,
          sub.id
        );

        db.prepare(`
          UPDATE users
          SET subscription_suspended = 0,
              subscription_suspended_at = NULL,
              status = CASE WHEN manual_suspended = 1 OR status = 'removed' THEN status ELSE 'active' END,
              suspension_type = CASE WHEN manual_suspended = 1 THEN 'manual' ELSE NULL END
          WHERE id = ?
        `).run(sub.provider_id);

        continue;
      }
    }

    // Case 1: Within paid period (nowMs < dueMs)
    if (nowMs < dueMs) {
      if (sub.status !== 'active') {
        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'active', updated_at = ?
          WHERE id = ?
        `).run(nowIso, sub.id);
      }
      continue;
    }

    // Case 2: Overdue, inside the 5-day grace period (dueMs <= nowMs < graceEndMs)
    if (nowMs >= dueMs && nowMs < graceEndMs) {
      const needsStatusUpdate = sub.status !== 'past_due';
      const needsOverdueReminder = !sub.overdue_reminder_sent_at;
      // Send pre-suspension reminder when within 48 hours of the 5-day suspension deadline
      const msUntilSuspension = graceEndMs - nowMs;
      const needsPreSuspensionReminder =
        !sub.pre_suspension_reminder_sent_at && msUntilSuspension <= 2 * 24 * 60 * 60 * 1000;

      if (needsStatusUpdate || needsOverdueReminder || needsPreSuspensionReminder) {
        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'past_due',
              overdue_reminder_sent_at = COALESCE(overdue_reminder_sent_at, ?),
              pre_suspension_reminder_sent_at = CASE WHEN ? = 1 THEN COALESCE(pre_suspension_reminder_sent_at, ?) ELSE pre_suspension_reminder_sent_at END,
              updated_at = ?
          WHERE id = ?
        `).run(
          nowIso,
          needsPreSuspensionReminder ? 1 : 0,
          nowIso,
          nowIso,
          sub.id
        );
      }

      if (needsOverdueReminder) {
        createNotification(
          sub.provider_id,
          'subscription',
          'Subscription Payment Overdue — 5-Day Grace Period Active',
          `Your monthly subscription of LKR ${(sub.monthly_fee || 1500).toLocaleString()} became due on ${formatSriLankaDateTime(sub.next_due_date)}. Your account remains active during a 5-day grace period until ${formatSriLankaDateTime(expectedGraceEndIso)}. Pay your subscription before the deadline to avoid automatic suspension.`,
          '/provider/dashboard'
        );

        for (const admin of admins) {
          createNotification(
            admin.id,
            'payment',
            'Provider Subscription Past Due (Grace Period)',
            `Provider ${sub.provider_name} (${sub.confirmation_id || sub.provider_email}) is Past Due on their monthly subscription. 5-day grace period expires on ${formatSriLankaDateTime(expectedGraceEndIso)}.`,
            '/admin?tab=payments'
          );
        }

        changes.push({ providerId: sub.provider_id, transition: 'past_due', gracePeriodEnd: expectedGraceEndIso });
      }

      if (needsPreSuspensionReminder) {
        createNotification(
          sub.provider_id,
          'subscription',
          'Urgent Reminder: Subscription Suspension in Less Than 48 Hours',
          `Final reminder: Your 5-day subscription grace period expires on ${formatSriLankaDateTime(expectedGraceEndIso)}. Please pay LKR ${(sub.monthly_fee || 1500).toLocaleString()} now to prevent your account from being set to Suspended — Unpaid Subscription.`,
          '/provider/dashboard'
        );
      }

      continue;
    }

    // Case 3: 5 full days have elapsed (nowMs >= graceEndMs) and payment remains unpaid -> Auto-suspend!
    if (nowMs >= graceEndMs) {
      const wasAlreadySuspendedUnpaid =
        sub.status === 'suspended_unpaid' && sub.subscription_suspended === 1 && sub.suspension_notice_sent_at;

      if (!wasAlreadySuspendedUnpaid) {
        db.transaction(() => {
          db.prepare(`
            UPDATE provider_subscriptions
            SET status = 'suspended_unpaid',
                suspension_notice_sent_at = COALESCE(suspension_notice_sent_at, ?),
                updated_at = ?
            WHERE id = ?
          `).run(nowIso, nowIso, sub.id);

          // Set subscription_suspended = 1 on users.
          // If not manually suspended, set status = 'suspended' and suspension_type = 'subscription_unpaid'.
          db.prepare(`
            UPDATE users
            SET subscription_suspended = 1,
                subscription_suspended_at = COALESCE(subscription_suspended_at, ?),
                status = CASE WHEN status = 'removed' THEN 'removed' ELSE 'suspended' END,
                suspension_type = CASE WHEN manual_suspended = 1 THEN 'manual' ELSE 'subscription_unpaid' END,
                suspension_reason = CASE
                  WHEN manual_suspended = 1 THEN suspension_reason
                  ELSE 'Suspended — Unpaid Subscription'
                END,
                suspended_at = COALESCE(suspended_at, ?)
            WHERE id = ?
          `).run(nowIso, nowIso, sub.provider_id);
        })();

        if (!sub.suspension_notice_sent_at) {
          logAccountAction({
            targetUserId: sub.provider_id,
            targetUserName: sub.provider_name,
            targetUserEmail: sub.provider_email,
            targetUserRole: 'provider',
            action: 'auto_suspend_unpaid_subscription',
            performedBy: 'system-scheduler',
            performedByName: 'Automated Billing Enforcement',
            reason: 'Suspended — Unpaid Subscription (5-day grace period expired)',
            details: {
              confirmationId: sub.confirmation_id,
              dueDate: sub.next_due_date,
              gracePeriodEnd: expectedGraceEndIso,
              suspendedAt: nowIso
            }
          });

          createNotification(
            sub.provider_id,
            'subscription',
            'Account Suspended — Unpaid Subscription',
            'Your account is suspended because your subscription payment is overdue. Pay your subscription to restore access.',
            '/provider/dashboard'
          );

          for (const admin of admins) {
            createNotification(
              admin.id,
              'payment',
              'Provider Suspended — Unpaid Subscription',
              `Provider ${sub.provider_name} (${sub.confirmation_id || sub.provider_email}) has been automatically set to Suspended — Unpaid Subscription after their 5-day grace period ended on ${formatSriLankaDateTime(expectedGraceEndIso)}.`,
              '/admin?tab=payments'
            );
          }

          changes.push({
            providerId: sub.provider_id,
            transition: 'suspended_unpaid',
            gracePeriodEnd: expectedGraceEndIso
          });
        }
      }
    }
  }

  return changes;
}

/**
 * Starts the server-side background job that checks overdue subscriptions and 5-day grace periods
 * every 60 seconds, even when nobody visits the website.
 */
export function startSubscriptionScheduler() {
  if (typeof globalThis !== 'undefined' && !globalThis.__jobzySubSchedulerStarted) {
    globalThis.__jobzySubSchedulerStarted = true;
    try {
      evaluateProviderSubscriptions();
    } catch (err) {
      console.error('Initial subscription evaluation error:', err);
    }
    const timer = setInterval(() => {
      try {
        evaluateProviderSubscriptions();
      } catch (err) {
        console.error('Scheduled subscription evaluation error:', err);
      }
    }, 60 * 1000);
    if (timer && typeof timer.unref === 'function') {
      timer.unref();
    }
  }
}

// Start scheduler automatically when module loads on the server
startSubscriptionScheduler();

/**
 * Checks if a provider is publicly visible in search & directories and eligible for new bookings.
 * Enforces the 5-day subscription grace period deadline in real time.
 * Must be:
 * 1. users.status === 'active' AND manual_suspended === 0 AND subscription_suspended === 0
 * 2. provider_profiles.verification_status === 'approved'
 * 3. provider_subscriptions.status IN ('active', 'past_due') within grace_period_end
 *    (Unpaid first subscription 'pending' strictly prevents activation!)
 */
export function isProviderPubliclyActive(providerId, nowOverride = null) {
  evaluateProviderSubscriptions(nowOverride);

  const db = getDb();
  const provider = db.prepare(`
    SELECT p.id, p.verification_status, p.registration_fee_paid,
           u.status as user_status, u.manual_suspended, u.subscription_suspended,
           u.created_at as user_created_at
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    WHERE p.id = ?
  `).get(providerId);

  if (
    !provider ||
    provider.user_status !== 'active' ||
    provider.manual_suspended === 1 ||
    provider.subscription_suspended === 1 ||
    provider.verification_status !== 'approved'
  ) {
    return false;
  }

  const sub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(providerId);

  if (!sub) {
    // Only legacy pre-existing accounts with an admin-defined future transition_date can be active without a subscription row
    const subSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = 'provider_subscription'").get();
    if (subSetting?.transition_date) {
      const transitionMs = new Date(subSetting.transition_date).getTime();
      const createdMs = new Date(provider.user_created_at).getTime();
      const nowMs = nowOverride ? new Date(nowOverride).getTime() : Date.now();
      if (createdMs < transitionMs && nowMs < transitionMs) {
        return true;
      }
    }
    return false;
  }

  // Unpaid first subscription ('pending') or suspended/cancelled/expired strictly prevents activation
  if (sub.status !== 'active' && sub.status !== 'past_due') {
    return false;
  }

  const nowMs = nowOverride ? new Date(nowOverride).getTime() : Date.now();
  if (sub.next_due_date) {
    const dueMs = new Date(sub.next_due_date).getTime();
    const graceEndMs = sub.grace_period_end
      ? new Date(sub.grace_period_end).getTime()
      : dueMs + FIVE_DAYS_MS;

    return nowMs < graceEndMs;
  }

  return sub.status === 'active';
}

/**
 * Create a new pending transaction before checkout.
 * Prevents duplicate charges for the same registration, booking, or subscription billing period.
 * Reuses existing pending transaction when retrying payment.
 */
export function createPendingTransaction({
  userId,
  userRole,
  feeType,
  relatedId,
  relatedType,
  paymentMethod = 'test_gateway',
  metadata = {},
  isTest = 1
}) {
  const db = getDb();

  // 1. Fetch current fee configuration on the server (never trusting client amount)
  const feeSetting = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(feeType);
  if (!feeSetting) {
    throw new Error(`Fee configuration not found for ${feeType}`);
  }

  if (!feeSetting.is_enabled) {
    throw new Error(`Payment for ${feeType} is currently disabled by administration.`);
  }

  // 2. Fetch user information
  const user = db.prepare('SELECT id, name, email, role, status FROM users WHERE id = ?').get(userId);
  if (!user) {
    throw new Error('User not found.');
  }

  const now = new Date().toISOString();
  const isLive = feeSetting.gateway_mode === 'live' && isTest === 0;

  let resolvedRelatedId = relatedId || null;
  let resolvedRelatedType = relatedType || null;
  let billingPeriodStart = null;
  let billingPeriodEnd = null;

  // =========================================================================
  // CASE A: Provider One-Time Registration Fee
  // =========================================================================
  if (feeType === 'provider_registration') {
    const profile = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(user.id);
    if (!profile) {
      throw new Error('Provider profile not found.');
    }
    resolvedRelatedId = profile.confirmation_id || user.id;
    resolvedRelatedType = 'registration';

    const existingPaid = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND fee_type = 'provider_registration' AND status = 'successful'
      LIMIT 1
    `).get(user.id);

    if (profile.registration_fee_paid === 1 || existingPaid) {
      throw new Error(
        `Registration fee has already been paid and verified${existingPaid ? ` (Ref: ${existingPaid.transaction_reference})` : ''}.`
      );
    }

    const existingPending = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND fee_type = 'provider_registration' AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id);

    if (existingPending) {
      db.prepare(`
        UPDATE transactions
        SET amount = ?, fee_version = ?, updated_at = ?
        WHERE id = ?
      `).run(feeSetting.amount, feeSetting.version, now, existingPending.id);
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(existingPending.id);
    }
  }

  // =========================================================================
  // CASE B: Provider Monthly Subscription
  // =========================================================================
  if (feeType === 'provider_subscription') {
    evaluateProviderSubscriptions();

    const profile = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(user.id);
    if (!profile) {
      throw new Error('Provider profile not found.');
    }
    if (!profile.registration_fee_paid) {
      throw new Error('Please complete your one-time registration fee payment before paying for a monthly subscription.');
    }
    if (profile.verification_status !== 'approved') {
      throw new Error('Your application is awaiting manual administrator approval. Monthly subscription payment is enabled after approval.');
    }

    const existingSub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(user.id);
    const periodInfo = calculateSubscriptionBillingPeriod(existingSub, now);

    if (periodInfo.alreadyPaidForCurrentPeriod) {
      throw new Error(
        `Your subscription for the current billing period (${formatSriLankaDateTime(periodInfo.currentPeriodStart, false)} to ${formatSriLankaDateTime(periodInfo.currentPeriodEnd, false)}) is already paid and active.`
      );
    }

    billingPeriodStart = periodInfo.periodStart;
    billingPeriodEnd = periodInfo.periodEnd;
    resolvedRelatedId = `${user.id}:${billingPeriodStart.slice(0, 10)}:${billingPeriodEnd.slice(0, 10)}`;
    resolvedRelatedType = 'subscription';

    // Check if an active billing period extending into the future was already paid
    const duplicatePeriodPaid = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ?
        AND fee_type = 'provider_subscription'
        AND status = 'successful'
        AND billing_period_end IS NOT NULL
        AND billing_period_end > ?
      LIMIT 1
    `).get(user.id, now);

    if (duplicatePeriodPaid) {
      throw new Error(
        `Subscription payment for the current active billing period has already been completed (Ref: ${duplicatePeriodPaid.transaction_reference}).`
      );
    }

    // Reuse existing pending subscription transaction for this provider if present
    const existingPending = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND fee_type = 'provider_subscription' AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(user.id);

    if (existingPending) {
      const updatedMeta = {
        ...JSON.parse(existingPending.metadata || '{}'),
        ...metadata,
        billing_period_start: billingPeriodStart,
        billing_period_end: billingPeriodEnd,
        grace_period_days: 5
      };
      db.prepare(`
        UPDATE transactions
        SET amount = ?,
            fee_version = ?,
            related_id = ?,
            billing_period_start = ?,
            billing_period_end = ?,
            metadata = ?,
            updated_at = ?
        WHERE id = ?
      `).run(
        feeSetting.amount,
        feeSetting.version,
        resolvedRelatedId,
        billingPeriodStart,
        billingPeriodEnd,
        JSON.stringify(updatedMeta),
        now,
        existingPending.id
      );
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(existingPending.id);
    }
  }

  // =========================================================================
  // CASE C: Customer Booking Fee
  // =========================================================================
  if (feeType === 'customer_booking') {
    if (!resolvedRelatedId) {
      throw new Error('bookingId (relatedId) is required for customer booking fee checkout.');
    }
    resolvedRelatedType = 'booking';

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(resolvedRelatedId);
    if (!booking) {
      throw new Error('Booking record not found.');
    }
    if (booking.customer_id !== user.id && user.role !== 'admin') {
      throw new Error('Unauthorized to pay for this booking.');
    }

    const existingPaid = db.prepare(`
      SELECT * FROM transactions
      WHERE related_id = ? AND fee_type = 'customer_booking' AND status = 'successful'
      LIMIT 1
    `).get(resolvedRelatedId);

    if (booking.booking_fee_status === 'paid' || existingPaid) {
      throw new Error(
        `Booking fee has already been paid for booking #${booking.booking_number}${existingPaid ? ` (Ref: ${existingPaid.transaction_reference})` : ''}.`
      );
    }

    // Reuse existing pending transaction for this booking so retries never create duplicate charges
    const existingPending = db.prepare(`
      SELECT * FROM transactions
      WHERE related_id = ? AND fee_type = 'customer_booking' AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(resolvedRelatedId);

    if (existingPending) {
      db.prepare(`
        UPDATE transactions
        SET updated_at = ?
        WHERE id = ?
      `).run(now, existingPending.id);
      return db.prepare('SELECT * FROM transactions WHERE id = ?').get(existingPending.id);
    }
  }

  const txnId = 'tx-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  const txnRef = generateTransactionReference();

  const finalMetadata = {
    ...metadata,
    ...(billingPeriodStart ? { billing_period_start: billingPeriodStart, billing_period_end: billingPeriodEnd, grace_period_days: 5 } : {})
  };

  db.prepare(`
    INSERT INTO transactions (
      id, transaction_reference, user_id, user_name, user_email, user_role,
      fee_type, fee_version, amount, currency, status, payment_method,
      related_id, related_type, billing_period_start, billing_period_end,
      metadata, is_test, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    txnId,
    txnRef,
    user.id,
    user.name,
    user.email,
    userRole || user.role,
    feeType,
    feeSetting.version,
    feeSetting.amount,
    feeSetting.currency || 'LKR',
    paymentMethod,
    resolvedRelatedId,
    resolvedRelatedType,
    billingPeriodStart,
    billingPeriodEnd,
    JSON.stringify(finalMetadata),
    isLive ? 0 : 1,
    now,
    now
  );

  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txnId);
}

/**
 * Confirms payment completion on the server after gateway verification.
 * Handles state transitions for registration, subscription, or booking fee.
 * Safe from duplicate processing (idempotent).
 */
export function confirmPayment(transactionIdOrRef, gatewayReference = '', gatewayResponse = {}, paymentMethod = null) {
  const db = getDb();

  const txn = db.prepare(`
    SELECT * FROM transactions
    WHERE id = ? OR transaction_reference = ?
  `).get(transactionIdOrRef, transactionIdOrRef);

  if (!txn) {
    throw new Error('Transaction not found.');
  }

  // If already successful, return safely without duplicating side-effects
  if (txn.status === 'successful') {
    return { success: true, transaction: txn, alreadyConfirmed: true };
  }

  const now = new Date().toISOString();

  const updateTxn = db.transaction(() => {
    // 1. Update transaction to successful
    db.prepare(`
      UPDATE transactions
      SET status = 'successful',
          gateway_reference = COALESCE(?, gateway_reference),
          gateway_response = ?,
          payment_method = COALESCE(?, payment_method),
          updated_at = ?
      WHERE id = ?
    `).run(
      gatewayReference || 'GW-CONFIRMED',
      JSON.stringify(gatewayResponse),
      paymentMethod,
      now,
      txn.id
    );

    // ==========================================
    // SIDE EFFECT A: Provider Registration Fee
    // ==========================================
    if (txn.fee_type === 'provider_registration') {
      // Mark registration fee paid and ensure status is 'pending' (Pending Admin Approval).
      // NEVER automatically approve the provider!
      db.prepare(`
        UPDATE provider_profiles
        SET registration_fee_paid = 1,
            registration_payment_id = ?,
            verification_status = CASE
              WHEN verification_status IN ('approved', 'rejected', 'changes_requested') THEN verification_status
              ELSE 'pending'
            END
        WHERE id = ?
      `).run(txn.id, txn.user_id);

      const profile = db.prepare('SELECT confirmation_id FROM provider_profiles WHERE id = ?').get(txn.user_id);

      // Notify administrator: Paid registration awaiting manual review
      const adminUsers = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      for (const admin of adminUsers) {
        createNotification(
          admin.id,
          'payment',
          'Paid Provider Registration — Pending Admin Approval',
          `Provider ${txn.user_name} (${profile?.confirmation_id || txn.user_email}) has paid the one-time registration fee of ${txn.currency} ${txn.amount.toLocaleString()}. Application status is now Pending Admin Approval.`,
          '/admin?tab=verifications'
        );
      }

      // Notify provider: Payment confirmed, now Pending Admin Approval
      createNotification(
        txn.user_id,
        'payment',
        'Registration Payment Verified — Pending Admin Approval',
        `Your one-time registration payment of ${txn.currency} ${txn.amount.toLocaleString()} (Ref: ${txn.transaction_reference}) has been verified. Your application status is now Pending Admin Approval.`,
        '/provider/dashboard'
      );
    }

    // ==========================================
    // SIDE EFFECT B: Provider Monthly Subscription
    // ==========================================
    if (txn.fee_type === 'provider_subscription') {
      const existingSub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(txn.user_id);
      const periodCalc = calculateSubscriptionBillingPeriod(existingSub, now);

      const periodStart = txn.billing_period_start || periodCalc.periodStart;
      const periodEnd = txn.billing_period_end || addOneCalendarMonth(periodStart);
      const nextDueDate = periodEnd;
      const graceDays = 5;
      const graceEndDate = computeFiveDayGraceDeadline(periodEnd);

      // Ensure transaction records the exact billing period applied
      db.prepare(`
        UPDATE transactions
        SET billing_period_start = ?, billing_period_end = ?
        WHERE id = ?
      `).run(periodStart, periodEnd, txn.id);

      if (existingSub) {
        db.prepare(`
          UPDATE provider_subscriptions
          SET status = 'active',
              current_period_start = ?,
              current_period_end = ?,
              next_due_date = ?,
              grace_period_days = ?,
              grace_period_end = ?,
              monthly_fee = ?,
              fee_version = ?,
              last_payment_id = ?,
              overdue_reminder_sent_at = NULL,
              pre_suspension_reminder_sent_at = NULL,
              suspension_notice_sent_at = NULL,
              updated_at = ?
          WHERE provider_id = ?
        `).run(
          periodStart,
          periodEnd,
          nextDueDate,
          graceDays,
          graceEndDate,
          txn.amount,
          txn.fee_version,
          txn.id,
          now,
          txn.user_id
        );
      } else {
        const subId = 'sub-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        db.prepare(`
          INSERT INTO provider_subscriptions (
            id, provider_id, status, current_period_start, current_period_end,
            next_due_date, grace_period_days, grace_period_end, monthly_fee,
            fee_version, last_payment_id, created_at, updated_at
          ) VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          subId,
          txn.user_id,
          periodStart,
          periodEnd,
          nextDueDate,
          graceDays,
          graceEndDate,
          txn.amount,
          txn.fee_version,
          txn.id,
          now,
          now
        );
      }

      // Check provider account & approval state before restoring access:
      // Automatically restore access ONLY if the account remains approved and has no separate manual suspension or removal!
      const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(txn.user_id);
      const profileRow = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(txn.user_id);

      const wasSubSuspended = userRow?.subscription_suspended === 1 || userRow?.suspension_type === 'subscription_unpaid';
      const hasManualSuspension = userRow?.manual_suspended === 1;
      const isRemoved = userRow?.status === 'removed';
      const isApproved = profileRow?.verification_status === 'approved';

      // Always clear the non-payment subscription suspension flag
      if (!hasManualSuspension && !isRemoved && isApproved) {
        db.prepare(`
          UPDATE users
          SET status = 'active',
              subscription_suspended = 0,
              subscription_suspended_at = NULL,
              suspension_type = NULL,
              suspension_reason = NULL,
              suspended_at = NULL,
              suspended_by = NULL
          WHERE id = ?
        `).run(txn.user_id);
      } else {
        // Clear only subscription_suspended, preserving manual suspension or removed status!
        db.prepare(`
          UPDATE users
          SET subscription_suspended = 0,
              subscription_suspended_at = NULL,
              suspension_type = CASE WHEN manual_suspended = 1 THEN 'manual' ELSE suspension_type END
          WHERE id = ?
        `).run(txn.user_id);
      }

      if (wasSubSuspended && !hasManualSuspension && !isRemoved && isApproved) {
        logAccountAction({
          targetUserId: txn.user_id,
          targetUserName: txn.user_name,
          targetUserEmail: txn.user_email,
          targetUserRole: 'provider',
          action: 'auto_restore_paid_subscription',
          performedBy: 'system-billing',
          performedByName: 'Automated Billing Verification',
          reason: `Subscription payment verified (${txn.transaction_reference}). Non-payment suspension cleared.`,
          details: {
            transactionReference: txn.transaction_reference,
            billingPeriodStart: periodStart,
            billingPeriodEnd: periodEnd
          }
        });
      }

      // Notify provider
      const restoredMsg =
        hasManualSuspension
          ? `Your subscription payment of ${txn.currency} ${txn.amount.toLocaleString()} for ${formatSriLankaDateTime(periodStart, false)} to ${formatSriLankaDateTime(periodEnd, false)} is recorded. Note: Your account remains under a separate manual administrator suspension.`
          : `Your Jobzy provider subscription is now active for the billing period ${formatSriLankaDateTime(periodStart, false)} to ${formatSriLankaDateTime(periodEnd, false)}. Payment Ref: ${txn.transaction_reference}.`;

      createNotification(
        txn.user_id,
        'subscription',
        wasSubSuspended && !hasManualSuspension ? 'Subscription Paid — Account Access Restored' : 'Monthly Subscription Activated',
        restoredMsg,
        '/provider/dashboard'
      );

      // Notify administrator
      const adminUsers = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
      for (const admin of adminUsers) {
        createNotification(
          admin.id,
          'payment',
          'Provider Subscription Payment Verified',
          `Provider ${txn.user_name} (${profileRow?.confirmation_id || txn.user_email}) paid their monthly subscription (${txn.currency} ${txn.amount.toLocaleString()}) covering ${formatSriLankaDateTime(periodStart, false)} to ${formatSriLankaDateTime(periodEnd, false)}.`,
          '/admin?tab=payments'
        );
      }
    }

    // ==========================================
    // SIDE EFFECT C: Customer Booking Fee
    // ==========================================
    if (txn.fee_type === 'customer_booking' && txn.related_id) {
      // Transition booking from awaiting_payment to pending (Pending Provider Acceptance)
      const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(txn.related_id);
      if (booking) {
        db.prepare(`
          UPDATE bookings
          SET status = CASE WHEN status = 'awaiting_payment' THEN 'pending' ELSE status END,
              booking_fee_status = 'paid',
              booking_fee_payment_id = ?,
              updated_at = ?
          WHERE id = ?
        `).run(txn.id, now, booking.id);

        // Notify provider of new paid booking request
        createNotification(
          booking.provider_id,
          'booking',
          `New Service Request #${booking.booking_number} — Pending Your Acceptance`,
          `Customer ${txn.user_name} has paid the platform booking fee for request #${booking.booking_number} (${booking.scheduled_date}, ${booking.scheduled_time_slot}). Please review and accept or decline.`,
          '/provider/dashboard'
        );

        // Notify customer: Booking submitted for provider acceptance
        createNotification(
          txn.user_id,
          'booking',
          `Booking #${booking.booking_number} — Pending Provider Acceptance`,
          `Your platform booking fee of ${txn.currency} ${txn.amount.toLocaleString()} has been verified. Your request is now Pending Provider Acceptance (payment enables your request to proceed; provider availability will be confirmed when the provider accepts).`,
          '/customer/dashboard'
        );

        // Notify administrator: Paid customer booking request
        const adminUsers = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
        for (const admin of adminUsers) {
          createNotification(
            admin.id,
            'payment',
            'Paid Customer Booking Request',
            `Booking #${booking.booking_number} by ${txn.user_name} is paid (Fee: ${txn.currency} ${txn.amount.toLocaleString()}) and is now Pending Provider Acceptance.`,
            '/admin?tab=bookings'
          );
        }
      }
    }
  });

  updateTxn();

  const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
  return { success: true, transaction: updated, alreadyConfirmed: false };
}

/**
 * Refund a successful transaction.
 * Do not describe a refund as completed until confirmed by gateway.
 */
export function processRefund(transactionId, adminId, reason = 'Administrator approved refund') {
  const db = getDb();

  const txn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transactionId);
  if (!txn) {
    throw new Error('Transaction not found.');
  }

  if (txn.status !== 'successful') {
    throw new Error(`Only successful transactions can be refunded. Current status: ${txn.status}`);
  }

  const now = new Date().toISOString();
  const refundRef = 'REF-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const runRefund = db.transaction(() => {
    db.prepare(`
      UPDATE transactions
      SET status = 'refunded',
          refund_reason = ?,
          refunded_at = ?,
          refunded_by = ?,
          refund_gateway_reference = ?,
          updated_at = ?
      WHERE id = ?
    `).run(
      reason,
      now,
      adminId,
      refundRef,
      now,
      txn.id
    );

    // If customer booking fee: update booking record
    if (txn.fee_type === 'customer_booking' && txn.related_id) {
      db.prepare(`
        UPDATE bookings
        SET booking_fee_status = 'refunded',
            updated_at = ?
        WHERE id = ?
      `).run(now, txn.related_id);
    }

    // Notify user of completed refund
    createNotification(
      txn.user_id,
      'refund',
      'Refund Processed Successfully',
      `Your payment of ${txn.currency} ${txn.amount.toLocaleString()} for ${txn.fee_type.replace('_', ' ')} has been refunded. Refund Ref: ${refundRef}. Reason: ${reason}`,
      txn.user_role === 'provider' ? '/provider/dashboard' : '/customer/dashboard'
    );

    // Notify admin
    createNotification(
      adminId,
      'refund',
      'Refund Completed',
      `Refund of ${txn.currency} ${txn.amount.toLocaleString()} for ${txn.transaction_reference} completed.`,
      '/admin?tab=payments'
    );
  });

  runRefund();

  return db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
}

/**
 * Financial metrics calculation
 */
export function getFinancialMetrics() {
  const db = getDb();

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_transactions,
      SUM(CASE WHEN status = 'successful' THEN amount ELSE 0 END) as gross_collections,
      SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END) as total_refunds,
      SUM(CASE WHEN status = 'successful' THEN gateway_fee ELSE 0 END) as total_gateway_fees,
      SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as unpaid_charges,
      SUM(CASE WHEN status = 'successful' AND fee_type = 'provider_registration' THEN amount ELSE 0 END) as registration_revenue,
      SUM(CASE WHEN status = 'successful' AND fee_type = 'provider_subscription' THEN amount ELSE 0 END) as subscription_revenue,
      SUM(CASE WHEN status = 'successful' AND fee_type = 'customer_booking' THEN amount ELSE 0 END) as booking_fee_revenue
    FROM transactions
  `).get();

  const netProceeds = (stats.gross_collections || 0) - (stats.total_refunds || 0) - (stats.total_gateway_fees || 0);

  return {
    ...stats,
    gross_collections: stats.gross_collections || 0,
    total_refunds: stats.total_refunds || 0,
    total_gateway_fees: stats.total_gateway_fees || 0,
    unpaid_charges: stats.unpaid_charges || 0,
    net_proceeds: netProceeds,
    registration_revenue: stats.registration_revenue || 0,
    subscription_revenue: stats.subscription_revenue || 0,
    booking_fee_revenue: stats.booking_fee_revenue || 0,
    grossCollections: stats.gross_collections || 0,
    refundedTotal: stats.total_refunds || 0,
    gatewayFees: stats.total_gateway_fees || 0,
    unpaidPendingCharges: stats.unpaid_charges || 0,
    netProceeds
  };
}

/**
 * Reconciles a transaction with the payment gateway on the server.
 * Used when a provider payment succeeded but the webhook was missed or delayed,
 * or when an administrator checks payment status.
 *
 * - Live mode: Verifies against PayHere Order Search API (if credentials configured).
 * - Test mode: Verifies and reconciles pending test transaction with audit trail.
 * - Does NOT mark an unpaid provider as paid if no payment transaction was initiated.
 * - Does NOT mark a failed/cancelled payment as paid.
 */
export async function reconcileGatewayPayment(transactionIdOrRef, providerId = null, feeType = 'provider_registration') {
  const db = getDb();
  let txn = null;

  if (transactionIdOrRef) {
    txn = db.prepare(`
      SELECT * FROM transactions
      WHERE id = ? OR transaction_reference = ?
    `).get(transactionIdOrRef, transactionIdOrRef);
  }

  if (!txn && providerId) {
    txn = db.prepare(`
      SELECT * FROM transactions
      WHERE user_id = ? AND fee_type = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(providerId, feeType);
  }

  if (!txn) {
    return {
      success: false,
      status: 'unpaid',
      verified: false,
      message: 'No payment transaction record found for this provider application. The one-time registration fee is unpaid.'
    };
  }

  // If already successful, ensure provider_profiles is linked and return verified
  if (txn.status === 'successful') {
    if (txn.fee_type === 'provider_registration') {
      db.prepare(`
        UPDATE provider_profiles
        SET registration_fee_paid = 1,
            registration_payment_id = COALESCE(registration_payment_id, ?)
        WHERE id = ?
      `).run(txn.id, txn.user_id);
    }
    const freshTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
    return {
      success: true,
      status: 'verified',
      verified: true,
      transaction: freshTxn,
      message: `Payment is verified and confirmed on the server (Ref: ${txn.transaction_reference}).`
    };
  }

  if (txn.status === 'failed' || txn.status === 'cancelled' || txn.status === 'refunded') {
    return {
      success: false,
      status: txn.status,
      verified: false,
      transaction: txn,
      message: `Payment status is '${txn.status}'. Provider must initiate a new payment.`
    };
  }

  // Transaction is 'pending'
  const feeSetting = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(txn.fee_type);
  const isLive = feeSetting?.gateway_mode === 'live' && txn.is_test === 0;

  if (isLive) {
    const appId = process.env.PAYHERE_APP_ID;
    const appSecret = process.env.PAYHERE_APP_SECRET;

    if (!appId || !appSecret) {
      return {
        success: false,
        status: 'pending',
        verified: false,
        transaction: txn,
        message: 'PayHere live API credentials (PAYHERE_APP_ID, PAYHERE_APP_SECRET) are not configured. Cannot automatically query gateway order API.'
      };
    }

    try {
      const authBaseUrl = (feeSetting?.payhere_merchant_id && feeSetting.payhere_merchant_id.startsWith('12'))
        ? 'https://www.payhere.lk'
        : 'https://sandbox.payhere.lk';

      const tokenRes = await fetch(`${authBaseUrl}/merchant/v1/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`
        },
        body: 'grant_type=client_credentials'
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return {
          success: false,
          status: 'pending',
          verified: false,
          transaction: txn,
          message: `PayHere authentication failed: ${tokenRes.status} ${errText}`
        };
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      const orderSearchRes = await fetch(`${authBaseUrl}/merchant/v1/payment/search?order_id=${encodeURIComponent(txn.transaction_reference)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!orderSearchRes.ok) {
        return {
          success: false,
          status: 'pending',
          verified: false,
          transaction: txn,
          message: `PayHere Order Search returned status ${orderSearchRes.status}`
        };
      }

      const searchResult = await orderSearchRes.json();
      const paymentItem = Array.isArray(searchResult?.data) ? searchResult.data[0] : null;

      if (!paymentItem) {
        return {
          success: false,
          status: 'pending',
          verified: false,
          transaction: txn,
          message: 'No completed gateway transaction found for this reference.'
        };
      }

      if (paymentItem.status === 'RECEIVED' || paymentItem.status === 'SUCCESS') {
        const paidAmount = Number(paymentItem.amount);
        if (paidAmount < Number(txn.amount)) {
          return {
            success: false,
            status: 'pending',
            verified: false,
            transaction: txn,
            message: `Paid amount (${paidAmount}) is less than required fee (${txn.amount}).`
          };
        }

        const confirmRes = confirmPayment(
          txn.id,
          String(paymentItem.payment_id || `PAYHERE-REC-${Date.now()}`),
          paymentItem,
          'payhere'
        );

        return {
          success: true,
          status: 'verified',
          verified: true,
          transaction: confirmRes.transaction,
          message: `Payment successfully reconciled with PayHere gateway. Verified amount: ${txn.currency} ${txn.amount}.`
        };
      } else if (paymentItem.status === 'FAILED' || paymentItem.status === 'CANCELLED') {
        const nowIso = new Date().toISOString();
        db.prepare("UPDATE transactions SET status = 'failed', gateway_response = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(paymentItem), nowIso, txn.id);
        const updatedTxn = db.prepare('SELECT * FROM transactions WHERE id = ?').get(txn.id);
        return {
          success: false,
          status: 'failed',
          verified: false,
          transaction: updatedTxn,
          message: `PayHere reported payment status '${paymentItem.status}'.`
        };
      } else {
        return {
          success: false,
          status: 'pending',
          verified: false,
          transaction: txn,
          message: `PayHere reported payment status: ${paymentItem.status || 'PENDING'}. Payment not yet completed.`
        };
      }
    } catch (apiErr) {
      console.error('Error querying PayHere API:', apiErr);
      return {
        success: false,
        status: 'pending',
        verified: false,
        transaction: txn,
        message: `Network error connecting to PayHere API: ${apiErr.message}`
      };
    }
  } else {
    // Test Environment / Simulated Gateway
    // In test environment, reconcile the pending test transaction.
    const confirmRes = confirmPayment(
      txn.id,
      `TEST-REC-${Date.now()}`,
      {
        reconciled_by: 'administrator_reconciliation',
        reconciled_at: new Date().toISOString(),
        gateway_mode: 'test'
      },
      'test_gateway'
    );

    return {
      success: true,
      status: 'verified',
      verified: true,
      transaction: confirmRes.transaction,
      message: `Test payment successfully reconciled and verified (Ref: ${txn.transaction_reference}).`
    };
  }
}
