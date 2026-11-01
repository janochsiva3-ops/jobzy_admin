import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { verifyAuth } from '@/lib/auth';
import { evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET(request) {
  evaluateProviderSubscriptions();
  const auth = verifyAuth(request);
  if (auth.error) {
    const errRes = NextResponse.json({ error: auth.error }, { status: auth.status });
    errRes.cookies.set('jobzy_token', '', { httpOnly: true, path: '/', sameSite: 'lax', maxAge: 0 });
    return errRes;
  }

  const db = getDb();
  const user = db.prepare(`
    SELECT id, name, email, role, phone, district, city, address, avatar, status,
           suspension_type, manual_suspended, manual_suspension_reason, manual_suspended_at,
           subscription_suspended, subscription_suspended_at, suspension_reason, created_at
    FROM users WHERE id = ?
  `).get(auth.user.id);

  if (!user) {
    return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  }

  let providerProfile = null;
  if (user.role === 'provider') {
    providerProfile = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM provider_profiles p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.id = ?
    `).get(user.id);

    if (providerProfile) {
      providerProfile.service_districts = JSON.parse(providerProfile.service_districts || '[]');
      providerProfile.skills = JSON.parse(providerProfile.skills || '[]');
      providerProfile.qualifications = JSON.parse(providerProfile.qualifications || '[]');
      providerProfile.portfolio_images = JSON.parse(providerProfile.portfolio_images || '[]');
      providerProfile.verification_documents = JSON.parse(providerProfile.verification_documents || '[]');
      providerProfile.availability = JSON.parse(providerProfile.availability || '{}');
      const sub = db.prepare('SELECT * FROM provider_subscriptions WHERE provider_id = ?').get(user.id);
      providerProfile.subscription = sub || null;
    }
  }

  const response = NextResponse.json({ user, providerProfile });
  const authHeader = request.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.substring(7);
    response.cookies.set('jobzy_token', rawToken, {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60
    });
  }
  return response;
}
