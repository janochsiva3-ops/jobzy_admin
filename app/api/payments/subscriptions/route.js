import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth, requireRole } from '@/lib/auth';
import { createPendingTransaction, evaluateProviderSubscriptions, calculateSubscriptionBillingPeriod } from '@/lib/paymentService';
import { formatSriLankaDateTime } from '@/lib/dateUtils';

export async function GET(request) {
  evaluateProviderSubscriptions();
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const db = getDb();

    if (auth.user.role === 'admin') {
      const subscriptions = db.prepare(`
        SELECT ps.*,
               u.name as provider_name, u.email as provider_email, u.phone as provider_phone,
               u.status as user_status, u.suspension_type, u.manual_suspended, u.manual_suspension_reason,
               u.subscription_suspended, u.subscription_suspended_at,
               p.confirmation_id, p.title as provider_title, p.verification_status, p.registration_fee_paid,
               t.transaction_reference as last_txn_ref, t.amount as last_txn_amount
        FROM provider_subscriptions ps
        JOIN users u ON ps.provider_id = u.id
        JOIN provider_profiles p ON ps.provider_id = p.id
        LEFT JOIN transactions t ON ps.last_payment_id = t.id
        ORDER BY
          CASE
            WHEN ps.status = 'suspended_unpaid' THEN 0
            WHEN ps.status = 'past_due' THEN 1
            WHEN ps.status = 'pending' THEN 2
            ELSE 3
          END,
          ps.next_due_date ASC
      `).all();

      return NextResponse.json({ subscriptions });
    }

    if (auth.user.role === 'provider') {
      const subscription = db.prepare(`
        SELECT ps.*,
               p.confirmation_id, p.verification_status, p.registration_fee_paid,
               t.transaction_reference as last_txn_ref
        FROM provider_subscriptions ps
        JOIN provider_profiles p ON ps.provider_id = p.id
        LEFT JOIN transactions t ON ps.last_payment_id = t.id
        WHERE ps.provider_id = ?
      `).get(auth.user.id);

      const feeSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = 'provider_subscription'").get();
      const regFeeSetting = db.prepare("SELECT * FROM platform_fee_settings WHERE fee_type = 'provider_registration'").get();

      const periodCalc = calculateSubscriptionBillingPeriod(subscription);

      return NextResponse.json({
        subscription: subscription || null,
        monthlyFee: feeSetting?.amount || 1500,
        registrationFee: regFeeSetting?.amount || 2500,
        gracePeriodDays: 5,
        transitionDate: feeSetting?.transition_date || null,
        upcomingBillingPeriod: {
          periodStart: periodCalc.periodStart,
          periodEnd: periodCalc.periodEnd,
          periodStartFormatted: formatSriLankaDateTime(periodCalc.periodStart, false),
          periodEndFormatted: formatSriLankaDateTime(periodCalc.periodEnd, false),
          alreadyPaidCurrentPeriod: periodCalc.alreadyPaidCurrentPeriod
        }
      });
    }

    return NextResponse.json({ error: 'Unauthorized role.' }, { status: 403 });
  } catch (err) {
    console.error('Error fetching subscriptions:', err);
    return NextResponse.json({ error: 'Failed to retrieve subscription details.' }, { status: 500 });
  }
}

export async function POST(request) {
  evaluateProviderSubscriptions();
  const auth = requireRole(request, 'provider');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const { paymentMethod = 'test_gateway' } = body;

    const db = getDb();
    const provider = db.prepare('SELECT * FROM provider_profiles WHERE id = ?').get(auth.user.id);

    if (!provider) {
      return NextResponse.json({ error: 'Provider profile not found.' }, { status: 404 });
    }

    // Provider must be approved before paying for subscription
    if (provider.verification_status !== 'approved') {
      return NextResponse.json({
        error: 'Your application is currently pending administrator verification. Subscription activates after approval.'
      }, { status: 400 });
    }

    // Initiate checkout for provider_subscription
    const transaction = createPendingTransaction({
      userId: auth.user.id,
      userRole: 'provider',
      feeType: 'provider_subscription',
      relatedId: provider.id,
      relatedType: 'subscription',
      paymentMethod,
      metadata: {
        provider_name: auth.user.name,
        confirmation_id: provider.confirmation_id
      }
    });

    return NextResponse.json({
      success: true,
      transaction
    });
  } catch (err) {
    console.error('Error initiating subscription payment:', err);
    return NextResponse.json({ error: err.message || 'Failed to initiate renewal.' }, { status: 400 });
  }
}

