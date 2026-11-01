import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET(request) {
  const auth = requireRole(request, 'admin');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  evaluateProviderSubscriptions();

  const db = getDb();
  const customersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'customer' AND status != 'removed'").get().count;
  const providersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND status != 'removed'").get().count;
  const approvedProvidersCount = db.prepare("SELECT COUNT(*) as count FROM provider_profiles p JOIN users u ON p.id = u.id WHERE p.verification_status = 'approved' AND u.status != 'removed'").get().count;
  const pendingVerificationsCount = db.prepare("SELECT COUNT(*) as count FROM provider_profiles p JOIN users u ON p.id = u.id WHERE p.verification_status = 'pending' AND u.status != 'removed'").get().count;
  const awaitingRegistrationPaymentCount = db.prepare("SELECT COUNT(*) as count FROM provider_profiles p JOIN users u ON p.id = u.id WHERE p.registration_fee_paid = 0 AND u.status != 'removed'").get().count;
  const pendingAdminApprovalCount = db.prepare("SELECT COUNT(*) as count FROM provider_profiles p JOIN users u ON p.id = u.id WHERE p.registration_fee_paid = 1 AND p.verification_status = 'pending' AND u.status != 'removed'").get().count;
  const changesRequestedCount = db.prepare("SELECT COUNT(*) as count FROM provider_profiles p JOIN users u ON p.id = u.id WHERE p.verification_status = 'changes_requested' AND u.status != 'removed'").get().count;
  const overdueSubscriptionsCount = db.prepare("SELECT COUNT(*) as count FROM provider_subscriptions ps JOIN users u ON ps.provider_id = u.id WHERE ps.status IN ('past_due', 'suspended_unpaid') AND u.status != 'removed'").get().count;
  const suspendedProvidersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'provider' AND status = 'suspended'").get().count;
  const unpaidBookingsCount = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'awaiting_payment' OR booking_fee_status = 'unpaid'").get().count;
  
  // New registrations in the last 7 days (or all non-admin registrations)
  const newRegistrationsCount = db.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE role IN ('customer', 'provider') 
    AND created_at >= datetime('now', '-7 days')
  `).get().count;

  const bookingsCount = db.prepare('SELECT COUNT(*) as count FROM bookings').get().count;
  const completedJobsCount = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status = 'completed'").get().count;
  const activeBookingsCount = db.prepare("SELECT COUNT(*) as count FROM bookings WHERE status IN ('pending', 'awaiting_quote_approval', 'confirmed', 'in_progress', 'awaiting_completion')").get().count;

  const volumeData = db.prepare(`
    SELECT 
      SUM(final_amount) as gross_volume,
      SUM(platform_commission_amount) as total_commission
    FROM bookings
    WHERE status = 'completed'
  `).get();

  return NextResponse.json({
    customersCount,
    providersCount,
    approvedProvidersCount,
    verifiedProvidersCount: approvedProvidersCount, // backwards compatible alias
    pendingVerificationsCount,
    awaitingRegistrationPaymentCount,
    pendingAdminApprovalCount,
    changesRequestedCount,
    overdueSubscriptionsCount,
    suspendedProvidersCount,
    unpaidBookingsCount,
    newRegistrationsCount,
    bookingsCount,
    completedJobsCount,
    activeBookingsCount,
    grossVolumeLKR: volumeData.gross_volume || 0,
    recordedCommissionLKR: volumeData.total_commission || 0
  });
}
