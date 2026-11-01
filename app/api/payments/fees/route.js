import { NextResponse } from 'next/server';
import getDb, { createNotification } from '@/lib/db';
import { verifyAuth, requireRole } from '@/lib/auth';

export async function GET(request) {
  try {
    const auth = verifyAuth(request);
    const db = getDb();

    const isAdmin = !auth.error && auth.user?.role === 'admin';

    let fees;
    if (isAdmin) {
      fees = db.prepare('SELECT * FROM platform_fee_settings ORDER BY id ASC').all();
    } else {
      // Public / non-admin: strip sensitive merchant secrets
      fees = db.prepare(`
        SELECT id, fee_type, title, description, amount, currency, is_enabled,
               effective_date, version, grace_period_days, transition_date, gateway_mode
        FROM platform_fee_settings
        WHERE is_enabled = 1
        ORDER BY id ASC
      `).all();
    }

    let history = [];
    if (isAdmin) {
      history = db.prepare(`
        SELECT h.*, u.name as changed_by_name
        FROM fee_change_history h
        LEFT JOIN users u ON h.changed_by = u.id
        ORDER BY h.created_at DESC
        LIMIT 50
      `).all();
    }

    return NextResponse.json({
      fees,
      history,
      isAdmin
    });
  } catch (err) {
    console.error('Error fetching fees:', err);
    return NextResponse.json({ error: 'Failed to retrieve fee settings.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const {
      feeType,
      amount,
      effectiveDate,
      reason,
      isEnabled = 1,
      gracePeriodDays,
      transitionDate,
      gatewayMode,
      payhereMerchantId,
      payhereMerchantSecret
    } = body;

    if (!feeType) {
      return NextResponse.json({ error: 'feeType is required.' }, { status: 400 });
    }

    const db = getDb();
    const existing = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(feeType);

    if (!existing) {
      return NextResponse.json({ error: `Fee setting not found for type: ${feeType}` }, { status: 404 });
    }

    const newAmount = amount !== undefined && !isNaN(parseFloat(amount)) ? parseFloat(amount) : existing.amount;
    const effDate = effectiveDate || existing.effective_date;
    const now = new Date().toISOString();
    const newVersion = (newAmount !== existing.amount) ? existing.version + 1 : existing.version;

    const runUpdate = db.transaction(() => {
      // 1. Update platform fee setting
      db.prepare(`
        UPDATE platform_fee_settings
        SET amount = ?,
            is_enabled = ?,
            effective_date = ?,
            version = ?,
            grace_period_days = COALESCE(?, grace_period_days),
            transition_date = COALESCE(?, transition_date),
            gateway_mode = COALESCE(?, gateway_mode),
            payhere_merchant_id = COALESCE(?, payhere_merchant_id),
            payhere_merchant_secret = COALESCE(?, payhere_merchant_secret),
            updated_by = ?,
            updated_at = ?
        WHERE fee_type = ?
      `).run(
        newAmount,
        isEnabled ? 1 : 0,
        effDate,
        newVersion,
        gracePeriodDays !== undefined ? parseInt(gracePeriodDays, 10) : null,
        transitionDate !== undefined ? transitionDate : null,
        gatewayMode || null,
        payhereMerchantId !== undefined ? payhereMerchantId.trim() : null,
        payhereMerchantSecret !== undefined ? payhereMerchantSecret.trim() : null,
        auth.user.id,
        now,
        feeType
      );

      // 2. If amount changed, record full audit trail in fee_change_history
      if (newAmount !== existing.amount) {
        const histId = 'fch-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
        db.prepare(`
          INSERT INTO fee_change_history (
            id, fee_type, previous_amount, new_amount, currency, effective_date,
            version, changed_by, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          histId,
          feeType,
          existing.amount,
          newAmount,
          existing.currency || 'LKR',
          effDate,
          newVersion,
          auth.user.id,
          reason || 'Administrator updated fee',
          now
        );

        // Notify active providers if subscription fee changed for future renewals
        if (feeType === 'provider_subscription') {
          const activeProviders = db.prepare("SELECT id FROM users WHERE role = 'provider' AND status = 'active'").all();
          for (const p of activeProviders) {
            createNotification(
              p.id,
              'fee_update',
              'Notice of Subscription Price Update',
              `The Jobzy monthly provider subscription will adjust to LKR ${newAmount.toLocaleString()} starting from ${effDate}. Changes apply to future renewals only.`,
              '/provider/dashboard'
            );
          }
        }
      }
    });

    runUpdate();

    const updated = db.prepare('SELECT * FROM platform_fee_settings WHERE fee_type = ?').get(feeType);
    return NextResponse.json({
      message: 'Fee setting successfully updated.',
      fee: updated
    });
  } catch (err) {
    console.error('Error updating fee setting:', err);
    return NextResponse.json({ error: 'Failed to update fee setting.' }, { status: 500 });
  }
}

