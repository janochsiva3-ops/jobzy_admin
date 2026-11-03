import { NextResponse } from 'next/server';
import getDb, { createNotification, logAccountAction } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { getActiveFeeSetting } from '@/lib/paymentService';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const { id } = await params;
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const provider = db.prepare(`
    SELECT p.*, u.name, u.email
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    WHERE p.id = ? OR p.confirmation_id = ?
  `).get(id, id);

  if (!provider) {
    return NextResponse.json({ error: 'Provider application not found.' }, { status: 404 });
  }

  if (provider.registration_fee_paid === 1) {
    return NextResponse.json({
      error: 'Registration fee has already been verified for this provider application.'
    }, { status: 400 });
  }

  const feeSetting = getActiveFeeSetting('provider_registration');
  const feeDue = feeSetting?.amount || 2500;
  const currency = feeSetting?.currency || 'LKR';

  // 1. Notify provider with in-app notification
  createNotification(
    provider.id,
    'payment',
    'Action Required: Pay One-Time Registration Fee',
    `Administrator reminder: To proceed with approval of your service provider application (${provider.confirmation_id || 'Jobzy'}), please complete your one-time registration fee payment of ${currency} ${feeDue.toLocaleString()} in your Provider Dashboard.`,
    '/provider/dashboard'
  );

  // 2. Record audit log
  logAccountAction({
    targetUserId: provider.id,
    targetUserName: provider.name,
    targetUserEmail: provider.email,
    targetUserRole: 'provider',
    action: 'send_payment_reminder',
    performedBy: auth.user.id,
    performedByName: auth.user.name,
    reason: 'Administrator sent one-time registration payment reminder.',
    details: {
      confirmationId: provider.confirmation_id,
      feeDue,
      currency
    }
  });

  return NextResponse.json({
    success: true,
    message: `Payment reminder successfully sent to ${provider.name} (${provider.email}).`
  });
}

