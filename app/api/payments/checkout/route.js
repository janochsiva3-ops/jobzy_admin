import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { createPendingTransaction, evaluateProviderSubscriptions, calculateSubscriptionBillingPeriod } from '@/lib/paymentService';
import { formatSriLankaDateTime } from '@/lib/dateUtils';
import crypto from 'crypto';

export async function POST(request) {
  evaluateProviderSubscriptions();
  const auth = verifyAuth(request);
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      feeType,
      relatedId,
      relatedType,
      paymentMethod = 'test_gateway',
      returnUrl,
      cancelUrl,
      metadata = {}
    } = body;

    if (!feeType) {
      return NextResponse.json({ error: 'feeType is required.' }, { status: 400 });
    }

    // Role check:
    if (feeType === 'provider_registration' || feeType === 'provider_subscription') {
      if (auth.user.role !== 'provider' && auth.user.role !== 'admin') {
        return NextResponse.json({ error: 'Only service providers can pay provider platform fees.' }, { status: 403 });
      }
    } else if (feeType === 'customer_booking') {
      if (auth.user.role !== 'customer' && auth.user.role !== 'admin') {
        return NextResponse.json({ error: 'Only customers can pay booking platform fees.' }, { status: 403 });
      }
    }

    const db = getDb();
    const feeSetting = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(feeType);

    if (!feeSetting) {
      return NextResponse.json({ error: `Fee setting not found for ${feeType}` }, { status: 404 });
    }

    if (!feeSetting.is_enabled) {
      return NextResponse.json({ error: `Payment for ${feeType} is currently disabled by administration.` }, { status: 403 });
    }

    // Create or reuse pending transaction on server (ensures fee is server-calculated)
    const transaction = createPendingTransaction({
      userId: auth.user.id,
      userRole: auth.user.role,
      feeType,
      relatedId,
      relatedType,
      paymentMethod,
      metadata: {
        ...metadata,
        user_name: auth.user.name,
        user_email: auth.user.email
      },
      isTest: feeSetting.gateway_mode === 'test' ? 1 : 0
    });

    const isTestGateway = feeSetting.gateway_mode === 'test' || !feeSetting.payhere_merchant_id;

    let payherePayload = null;
    if (!isTestGateway && feeSetting.payhere_merchant_id && feeSetting.payhere_merchant_secret) {
      const merchantId = feeSetting.payhere_merchant_id;
      const merchantSecret = feeSetting.payhere_merchant_secret;
      const orderId = transaction.transaction_reference;
      const amountFormatted = parseFloat(transaction.amount).toFixed(2);
      const currency = transaction.currency || 'LKR';

      const hashedSecret = crypto.createHash('md5').update(merchantSecret).digest('hex').toUpperCase();
      const hashSource = `${merchantId}${orderId}${amountFormatted}${currency}${hashedSecret}`;
      const hash = crypto.createHash('md5').update(hashSource).digest('hex').toUpperCase();

      const origin = request.headers.get('origin') || 'http://localhost:3000';
      payherePayload = {
        sandbox: feeSetting.gateway_mode === 'test',
        merchant_id: merchantId,
        return_url: returnUrl || `${origin}/payments/success?ref=${orderId}`,
        cancel_url: cancelUrl || `${origin}/payments/cancel?ref=${orderId}`,
        notify_url: `${origin}/api/payments/payhere/notify`,
        order_id: orderId,
        items: feeSetting.title,
        amount: amountFormatted,
        currency,
        hash,
        first_name: auth.user.name.split(' ')[0] || 'User',
        last_name: auth.user.name.split(' ').slice(1).join(' ') || 'Jobzy',
        email: auth.user.email,
        phone: auth.user.phone || '+94700000000',
        address: auth.user.address || 'Sri Lanka',
        city: auth.user.city || 'Colombo',
        country: 'Sri Lanka'
      };
    }

    let billingPeriod = null;
    if (feeType === 'provider_subscription') {
      const pStart = transaction.billing_period_start;
      const pEnd = transaction.billing_period_end;
      if (pStart && pEnd) {
        billingPeriod = {
          periodStart: pStart,
          periodEnd: pEnd,
          periodStartFormatted: formatSriLankaDateTime(pStart, false),
          periodEndFormatted: formatSriLankaDateTime(pEnd, false),
          periodEndDateTimeFormatted: formatSriLankaDateTime(pEnd, true),
          gracePeriodDays: 5
        };
      } else {
        const existingSub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(auth.user.id);
        const calc = calculateSubscriptionBillingPeriod(existingSub);
        billingPeriod = {
          periodStart: calc.periodStart,
          periodEnd: calc.periodEnd,
          periodStartFormatted: formatSriLankaDateTime(calc.periodStart, false),
          periodEndFormatted: formatSriLankaDateTime(calc.periodEnd, false),
          periodEndDateTimeFormatted: formatSriLankaDateTime(calc.periodEnd, true),
          gracePeriodDays: 5
        };
      }
    }

    return NextResponse.json({
      success: true,
      transaction,
      billingPeriod,
      feeSetting: {
        feeType: feeSetting.fee_type,
        title: feeSetting.title,
        description: feeSetting.description,
        amount: feeSetting.amount,
        currency: feeSetting.currency,
        version: feeSetting.version,
        gatewayMode: feeSetting.gateway_mode,
        gracePeriodDays: 5
      },
      isTestGateway,
      payherePayload
    });
  } catch (err) {
    console.error('Error during checkout initiation:', err);
    return NextResponse.json({ error: err.message || 'Checkout initialization failed.' }, { status: 400 });
  }
}

