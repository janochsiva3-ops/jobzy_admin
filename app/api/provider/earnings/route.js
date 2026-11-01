import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(request) {
  const auth = requireRole(request, 'provider');
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const db = getDb();
  const records = db.prepare(`
    SELECT 
      fl.*,
      b.booking_number, b.service_title, b.scheduled_date, b.payment_status
    FROM financial_ledger fl
    LEFT JOIN bookings b ON fl.booking_id = b.id
    WHERE fl.provider_id = ?
    ORDER BY fl.recorded_at DESC
  `).all(auth.user.id);

  const stats = db.prepare(`
    SELECT 
      SUM(gross_amount) as total_gross,
      SUM(commission_amount) as total_commission,
      SUM(net_provider_amount) as total_net
    FROM financial_ledger
    WHERE provider_id = ?
  `).get(auth.user.id);

  return NextResponse.json({
    records,
    totals: {
      totalGross: stats.total_gross || 0,
      totalCommission: stats.total_commission || 0,
      totalNet: stats.total_net || 0
    }
  });
}
