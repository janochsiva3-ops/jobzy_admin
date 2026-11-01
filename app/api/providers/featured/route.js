import { NextResponse } from 'next/server';
import getDb from '@/lib/db';
import { isProviderPubliclyActive, evaluateProviderSubscriptions } from '@/lib/paymentService';

export async function GET() {
  evaluateProviderSubscriptions();
  const db = getDb();
  const providers = db.prepare(`
    SELECT 
      u.id, u.name, u.avatar, u.district, u.city,
      p.title, p.bio, p.experience_years, p.pricing_type, p.base_rate,
      p.pricing_description, p.service_districts, p.service_towns, p.skills,
      p.verification_status, p.is_sponsored, p.sponsored_label,
      p.rating_avg, p.review_count,
      c.name as category_name, c.slug as category_slug
    FROM provider_profiles p
    JOIN users u ON p.id = u.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE u.status = 'active' AND p.verification_status = 'approved'
    ORDER BY p.is_sponsored DESC, p.rating_avg DESC
    LIMIT 6
  `).all();

  const activeProviders = providers.filter(p => isProviderPubliclyActive(p.id));
  const formatted = activeProviders.map(p => ({
    ...p,
    service_districts: JSON.parse(p.service_districts || '[]'),
    skills: JSON.parse(p.skills || '[]')
  }));

  return NextResponse.json(formatted);
}
